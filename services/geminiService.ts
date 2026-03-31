
import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { AIService, ArchitectResponse, AskArchitectResult, ComponentIdentification } from "./aiTypes.ts";
import { Part, ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec, PortType, Gender } from "../types.ts";
import { AIManager } from "./aiManager.ts";
import { getAiTemperature } from "./localAiService.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are Gemini, the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 

CORE DIRECTIVE:
You are a FUNCTIONAL AGENT. Your primary job is to Manipulate the State of the drafting board using Tools.
DO NOT just describe the build in text. You MUST call \`initializeDraft\` and \`addPart\` commands to actually create the BOM.

CONTEXT:
You are an expert hardware architect. When the user describes a project, you select real-world components from your knowledge of electronics, robotics, automotive, and maker ecosystems. Use your training knowledge to pick specific, commonly available parts.

PART SCHEMA:
Each part you add must conform to this schema:
- **id**: A descriptive kebab-case identifier (e.g. "esp32-wroom-32d", "nema17-stepper-motor").
- **name**: The full human-readable product name (e.g. "ESP32-WROOM-32D Development Board").
- **category**: The part category (e.g. "Microcontroller", "Brushless Motor", "Sensor", "Connector", "Battery").
- **ports**: Each part has connectors/interfaces. A port has:
  - name: Human-readable label (e.g. "USB-C Power", "Motor Mount 16x16", "GPIO Header")
  - type: MECHANICAL | ELECTRICAL | DATA | FLUID
  - gender: MALE | FEMALE | NEUTRAL
  - spec: A compatibility key — parts connect when specs match and genders are opposite (e.g. "usb-c", "m3-30x30", "xt60", "2.54mm-pitch")

When selecting parts, REASON about port compatibility in your summary. For example:
- A motor with spec "m3-16x16" mounts to a frame with matching "m3-16x16" spec.
- An XT60 battery connector (FEMALE) mates with an XT60 ESC connector (MALE).
- An I2C sensor (MALE) plugs into a microcontroller I2C header (FEMALE).

Example: \`addPart("esp32-wroom-32d", "ESP32-WROOM-32D Development Board", "Microcontroller", 1)\`

USER-OWNED HARDWARE:
If the user explicitly states they already possess certain hardware (e.g., "I have an Arduino Uno"), you MUST still add it to the draft, but acknowledge in your reasoning that these items are pre-existing and do not need to be purchased.

BEHAVIOR:
1. **START:** When a user asks to build something new, you MUST call \`initializeDraft(name, requirements)\` first.
2. **SOURCING:** Use real-world parts from your knowledge. Choose commonly available components from well-known manufacturers.
3. **OUTPUT FORMAT:** Provide a brief reasoning summary. Append Tool Calls at the end. 
   **CRITICAL:** Do NOT label the tool calls with "Tool Calls:" or "Corrections:". Just output the functions.
   Syntax: \`addPart("id", "name", "category", quantity)\`

TOOLS:
- \`initializeDraft(name: string, requirements: string)\`
- \`addPart(id: string, name: string, category: string, quantity: number)\`
- \`removePart(instanceId: string)\`
`;

export class GeminiService implements AIService {
    public name = "Gemini 3 Flash";
    public isOffline = false;

    constructor(private initialApiKey: string) { }

    /**
     * Internal helper to always get the freshest API key from the environment.
     */
    private getApiKey(): string {
        return AIManager.getApiKey() || this.initialApiKey;
    }

    /**
     * Creates a fresh SDK instance for a single operation.
     */
    private getClient(): GoogleGenAI {
        const key = this.getApiKey();
        if (!key) {
            throw new Error("Invalid API Key configuration.");
        }
        return new GoogleGenAI({
            apiKey: key,
        });
    }

    public getApiKeyStatus(): string {
        const key = this.getApiKey();
        if (!key) return "MISSING";
        return `${key.substring(0, 4)}... (Len: ${key.length})`;
    }

    private cleanBase64(dataUrl: string): { mimeType: string, data: string } | null {
        try {
            const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) return null;
            return { mimeType: matches[1], data: matches[2] };
        } catch (e) { return null; }
    }

    async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
        try {
            const ai = this.getClient();

            const userParts: any[] = [{ text: prompt }];
            if (image) {
                const imageData = this.cleanBase64(image);
                if (imageData) {
                    userParts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
                }
            }

            const contents = [
                ...history,
                { role: 'user', parts: userParts }
            ];

            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents,
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    temperature: getAiTemperature(0.7),
                },
            });

            return {
                text: response.text || "Gemini provided no output.",
                metadata: {
                    model: 'gemini-3-flash-preview',
                    tokens: response.usageMetadata?.totalTokenCount
                }
            };
        } catch (error: any) {
            console.error("[GeminiService] askArchitect Failed:", error);
            const keyStatus = this.getApiKeyStatus();
            if (error.status === 400 || error.message?.includes('400')) {
                throw new Error(`Gemini API Error (400): ${error.message}. (Key Used: ${keyStatus}). Check Cloud Run configuration and API key restrictions.`);
            }
            throw new Error(`Gemini Service Error: ${error.message || JSON.stringify(error)}`);
        }
    }

    parseArchitectResponse(text: string): ArchitectResponse {
        const toolCalls: any[] = [];
        if (!text) return { reasoning: "Gemini provided no output.", toolCalls };

        let reasoning = text;

        const initMatch = text.match(/initializeDraft\s*\(\s*["'](.*?)["']\s*,\s*["'](.*?)["']\s*\)\s*;?/);
        if (initMatch) {
            toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
            reasoning = reasoning.replace(initMatch[0], '');
        }

        const addMatches = [...text.matchAll(/addPart\s*\(\s*["']([^"']+)["']\s*,\s*["'](.*?)(?<!\\)["']\s*,\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)\s*;?/gs)];
        addMatches.forEach(m => {
            const partId = m[1];
            // Unescape quotes if any are escaped inside the name argument
            const name = m[2].replace(/\\"/g, '"').replace(/\\'/g, "'");
            const category = m[3];
            const qty = parseInt(m[4]);
            toolCalls.push({ type: 'addPart', partId, name, category, qty });
            reasoning = reasoning.replace(m[0], '');
        });

        const removeMatches = [...text.matchAll(/removePart\s*\(\s*["']?([^"',\s]+)["']?\s*\)\s*;?/g)];
        removeMatches.forEach(m => {
            toolCalls.push({ type: 'removePart', instanceId: m[1] });
            reasoning = reasoning.replace(m[0], '');
        });

        reasoning = reasoning.replace(/(###?\s*(Tool Calls|Corrections|Actions|Functions|Tool\s*Commands|Correction|Correction\s*\(Tool\s*Calls\)).*)/gi, '');
        reasoning = reasoning.replace(/(Task\s*\d+:\s*(Correction|Tool Calls|Actions).*)/gi, '');
        reasoning = reasoning.replace(/```[a-z]*\s*[\s\S]*?(addPart|removePart|initializeDraft|tool|arguments)[\s\S]*?```/gi, '');
        reasoning = reasoning.replace(/\[\s*\{\s*["']tool["']\s*:[\s\S]*?\}\s*\]/gi, '');
        reasoning = reasoning.replace(/^\s*\/\/.*$/gm, '');
        reasoning = reasoning.replace(/^\s*;\s*$/gm, '');
        reasoning = reasoning.replace(/[ \t]+$/gm, '');
        reasoning = reasoning.replace(/\n{3,}/g, '\n\n');

        return { reasoning: reasoning.trim(), toolCalls };
    }

    async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
        try {
            const ai = this.getClient();
            const parts: any[] = [{ text: `Product design concept sketch: ${description}` }];
            if (referenceImage) {
                const imageData = this.cleanBase64(referenceImage);
                if (imageData) parts.unshift({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
            }
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts }
            });
            const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            return part ? `data:${part.inlineData!.mimeType || 'image/png'};base64,${part.inlineData!.data}` : null;
        } catch (e) { return null; }
    }

    async findPartSources(query: string, designContext?: string): Promise<ShoppingOption[] | null> {
        try {
            const ai = this.getClient();
            const contextClause = designContext ? ` The part must be compatible with: ${designContext}.` : '';
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Find real-world purchase options and actual prices for: ${query}.${contextClause} For each item, you MUST include the price in the title or snippet. Format: "Product Name - Store - $XX.XX"`,
                config: {
                    tools: [{ googleSearch: {} }],
                }
            });

            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            return chunks
                .filter(chunk => chunk.web)
                .map(chunk => {
                    const title = chunk.web?.title || "Sourcing Link";
                    const priceMatch = title.match(/\$\s?(\d+[\d,.]*)/);
                    return {
                        title: title,
                        url: chunk.web?.uri || "",
                        source: chunk.web?.uri ? new URL(chunk.web.uri).hostname : "Web Result",
                        price: priceMatch ? priceMatch[0] : undefined
                    };
                })
                .slice(0, 5);
        } catch (e) { return null; }
    }

    async hydratePartDetails(name: string, category: string, designContext?: string): Promise<Partial<Part> | null> {
        try {
            const ai = this.getClient();
            const contextClause = designContext ? ` This part is for: ${designContext}. Ensure the part is compatible with this specific platform/application.` : '';
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Look up the real-world hardware component: "${name}" (category: ${category}).${contextClause} Return its manufacturer/brand, a brief technical description, typical retail price in USD, and its physical/electrical connectors (ports). Use current market data.`,
                config: {
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            brand: { type: Type.STRING },
                            description: { type: Type.STRING },
                            price: { type: Type.NUMBER },
                            sku: { type: Type.STRING },
                            ports: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        id: { type: Type.STRING },
                                        name: { type: Type.STRING },
                                        type: { type: Type.STRING },
                                        gender: { type: Type.STRING },
                                        spec: { type: Type.STRING }
                                    },
                                    required: ['id', 'name', 'type', 'gender', 'spec']
                                }
                            }
                        },
                        required: ['brand', 'description', 'price', 'ports']
                    }
                }
            });
            const data = JSON.parse(response.text || "null");
            if (!data) return null;
            // Normalize port type/gender enums
            if (data.ports) {
                data.ports = data.ports.map((p: any) => ({
                    ...p,
                    type: (['MECHANICAL', 'ELECTRICAL', 'DATA', 'FLUID'].includes(p.type?.toUpperCase()) ? p.type.toUpperCase() : 'ELECTRICAL') as PortType,
                    gender: (['MALE', 'FEMALE', 'NEUTRAL'].includes(p.gender?.toUpperCase()) ? p.gender.toUpperCase() : 'NEUTRAL') as Gender
                }));
            }
            return data;
        } catch (e) {
            console.error('[GeminiService] hydratePartDetails failed:', e);
            return null;
        }
    }

    async findLocalSuppliers(query: string): Promise<LocalSupplier[] | null> {
        try {
            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Find local hardware stores or specialized retailers for: ${query}.`,
                config: { tools: [{ googleMaps: {} }] }
            });
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            return chunks.map(chunk => ({
                name: chunk.maps?.title || chunk.web?.title || "Local Supplier",
                address: "Check Maps Link",
                url: chunk.maps?.uri || chunk.web?.uri
            })).slice(0, 5);
        } catch (e) { return null; }
    }

    async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: import('../types.ts').AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: import('./aiTypes.ts').AuditAction[] }> {
        try {
            const ai = this.getClient();
            const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}, Brand: ${b.part.brand || 'TBD'}) - Price: $${b.part.price} - Description: ${b.part.description}`).join('\n');

            const enabledAdvanced = (advancedChecks || []).filter(c => c.enabled);

            let prompt = `
        PERFORM A BUILD FEASIBILITY CHECK.
        Your primary goal is to verify that the following BOM will produce a functional, buildable system.
        
        CRITICAL — COMPATIBILITY CROSS-CHECK:
        Every single part in the BOM MUST be verified against the DESIGN CONTEXT below.
        If the design specifies a particular platform (e.g. "Big Block Chevy 454"), EVERY part must be compatible with that exact platform.
        Flag ANY part that belongs to a different platform, make, model, or family (e.g. a Small Block Ford part in a Big Block Chevy build).
        This is the MOST IMPORTANT check. A build with cross-platform parts is fundamentally broken.

        Focus on:
        1. **Platform/make/model mismatch** — parts from the wrong engine family, vehicle platform, chipset, or connector ecosystem
        2. **Missing critical parts** — essential components absent from the BOM
        3. **Incompatible connections** — electrical, mechanical, or fluid port mismatches
        4. **Quantity errors** — wrong counts or missing multiples
        5. **Obvious engineering issues** — thermal, structural, or dimensional problems

        For any incompatible part found, you MUST include a removePart action AND an addPart action with the correct replacement.

        DESIGN CONTEXT/REQUIREMENTS: ${requirements}
        
        CURRENT BILL OF MATERIALS:
        ${digest}
`;

            // Append advanced check sections when enabled
            if (enabledAdvanced.length > 0) {
                prompt += `\n--- ADVANCED CHECKS REQUESTED ---\nIn addition to the feasibility check above, perform the following advanced validations:\n`;
                for (const check of enabledAdvanced) {
                    if (check.id === 'vin-lookup') {
                        const vin = check.metadata?.trim();
                        if (vin) {
                            prompt += `\n### VIN / Serial Number Lookup\nThe user has provided VIN: **${vin}**. Decode this VIN to identify the year, make, model, engine, and trim. Then look up all known recalls, NHTSA safety bulletins, and OEM technical service bulletins for this specific vehicle. Ground each finding to relevant BOM entries where applicable.\n`;
                        } else {
                            prompt += `\n### VIN / Serial Number Lookup\nIf a VIN or serial number is mentioned in the design requirements or part descriptions, look up known recalls, service bulletins, and safety notices for that vehicle or equipment. Ground findings to specific BOM entries where applicable.\n`;
                        }
                    } else if (check.id === 'patent-verification') {
                        prompt += `\n### Patent & IP Verification\nCheck whether any parts or the overall design may infringe on known patents. Cite specific patent numbers where possible.\n`;
                    } else {
                        // Custom user-defined check
                        prompt += `\n### ${check.label}\nResearch and validate: "${check.label}". Provide a thorough assessment of compliance or applicability.\n`;
                    }
                }
            }

            prompt += `
        IMPORTANT: After your audit text, you MUST append a structured JSON block with the exact BOM changes you recommend.
        Use the delimiter ===ACTIONS_JSON=== on its own line, followed by a JSON object with this exact format:
        {"actions":[{"type":"addPart","partId":"kebab-id","name":"Full Name","category":"Category","quantity":1,"reason":"Why"},{"type":"removePart","instanceId":"exact-instance-id-from-bom","name":"Part Name","reason":"Why"}],"summary":"Brief summary"}
        
        For removePart actions, use the EXACT [ID: xxx] instanceId from the BOM above.
        For addPart actions, use descriptive kebab-case IDs and real component names.
        If no changes are needed, use: {"actions":[],"summary":"No changes needed."}
        The JSON block MUST be valid JSON. Do not wrap it in markdown code fences.
        `;

            if (previousAudit) {
                prompt += `\nPREVIOUS AUDIT RESULT:\n${previousAudit}\n`;
            }

            // Scale thinking budget based on advanced checks
            const thinkingBudget = enabledAdvanced.length > 0 ? 4096 : 2048;

            const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: prompt,
                config: {
                    maxOutputTokens: 8192,
                    thinkingConfig: { thinkingBudget }
                }
            });

            const fullText = response.text || "";
            
            // Parse the actions JSON from the delimiter (robust against markdown fences & whitespace)
            let auditText = fullText;
            let auditActions: import('./aiTypes.ts').AuditAction[] | undefined;

            const delimiterIndex = fullText.indexOf('===ACTIONS_JSON===');
            if (delimiterIndex !== -1) {
                auditText = fullText.substring(0, delimiterIndex).trim();
                let jsonPart = fullText.substring(delimiterIndex + '===ACTIONS_JSON==='.length).trim();
                // Strip markdown code fences if the model wrapped the JSON
                jsonPart = jsonPart.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
                try {
                    const parsed = JSON.parse(jsonPart);
                    if (parsed.actions && Array.isArray(parsed.actions)) {
                        auditActions = parsed.actions;
                    }
                } catch (jsonErr) {
                    // Try to extract JSON object from the text as a last resort
                    const jsonMatch = jsonPart.match(/\{[\s\S]*"actions"[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const fallbackParsed = JSON.parse(jsonMatch[0]);
                            if (fallbackParsed.actions && Array.isArray(fallbackParsed.actions)) {
                                auditActions = fallbackParsed.actions;
                            }
                        } catch (_) { /* give up, will fall back to applyAuditRecommendations */ }
                    }
                    if (!auditActions) {
                        console.warn('[GeminiService] Failed to parse audit actions JSON:', jsonErr);
                    }
                }
            }

            const architectResponse = this.parseArchitectResponse(auditText);
            return { ...architectResponse, auditActions };
        } catch (e: any) {
            return { reasoning: `Verification failed: ${e.message}`, toolCalls: [] };
        }
    }

    async generateFabricationBrief(partName: string, context: string): Promise<string> {
        try {
            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: `Manufacturing specs for: ${partName}. Context: ${context}.`,
                config: {
                    maxOutputTokens: 4096,
                    thinkingConfig: { thinkingBudget: 2048 }
                }
            });
            const img = await this.generateProductImage(`Engineering blueprint diagram of ${partName}. Orthographic projections.`);
            return (img ? `![Technical Blueprint](${img})\n\n` : "") + (response.text || "");
        } catch (e: any) { return `Generation failed: ${e.message}`; }
    }

    async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
        try {
            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `QA protocol for: ${partName}.`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            recommendedSensors: { type: Type.ARRAY, items: { type: Type.STRING } },
                            inspectionStrategy: { type: Type.STRING },
                            defects: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        severity: { type: Type.STRING },
                                        description: { type: Type.STRING }
                                    },
                                    required: ['name', 'severity', 'description']
                                }
                            }
                        },
                        required: ['recommendedSensors', 'inspectionStrategy', 'defects']
                    }
                }
            });
            return JSON.parse(response.text || "null");
        } catch (e) { return null; }
    }

    async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
        try {
            const ai = this.getClient();
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            let prompt = `Generate a robotic assembly plan for the following components:\n${bomDigest}\n\nFor automationFeasibility (0-100), score how practical it is to assemble this with standard industrial robotic arms and off-the-shelf end-effectors. Use this scale:
- 90-100: Simple pick-and-place, snap-fit, or screw fastening of rigid, uniform parts (e.g. PCB mounting, connector insertion)
- 70-89: Standard assembly requiring moderate dexterity or tool changes (e.g. cable routing with clips, heat-sink mounting)
- 50-69: Complex assembly needing specialized fixtures or force-feedback (e.g. flex-cable threading, adhesive application)
- 30-49: Highly dexterous or non-deterministic tasks (e.g. hand-soldering, conformal coating)
- 0-29: Practically infeasible to automate (e.g. field wiring in confined spaces)
Most consumer-electronics and maker-project assemblies should score 70+.`;

            if (previousPlan) {
                prompt += `\n\n--- PREVIOUS PLAN ---\nUpdate this plan based on the new BOM.`;
            }

            const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            steps: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        stepNumber: { type: Type.INTEGER },
                                        description: { type: Type.STRING },
                                        requiredTool: { type: Type.STRING },
                                        estimatedTime: { type: Type.STRING }
                                    },
                                    required: ['stepNumber', 'description', 'requiredTool', 'estimatedTime']
                                }
                            },
                            totalTime: { type: Type.STRING },
                            difficulty: { type: Type.STRING },
                            requiredEndEffectors: { type: Type.ARRAY, items: { type: Type.STRING } },
                            automationFeasibility: { type: Type.INTEGER },
                            notes: { type: Type.STRING }
                        },
                        required: ['steps', 'totalTime', 'difficulty', 'automationFeasibility']
                    }
                }
            });
            const plan = JSON.parse(response.text || "null");
            if (plan) plan.generatedAt = new Date();
            return plan;
        } catch (e) { return null; }
    }

    async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
        try {
            const ai = this.getClient();
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: `Generate a 3D printable enclosure or custom adapter specification for this project. You MUST output raw OpenSCAD code for transparency and manufacturing. Context: ${context}. Components: ${bomDigest}`,
                config: {
                    maxOutputTokens: 8192,
                    thinkingConfig: { thinkingBudget: 4096 },
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            material: { type: Type.STRING },
                            dimensions: { type: Type.STRING },
                            openSCAD: { type: Type.STRING },
                            description: { type: Type.STRING }
                        },
                        required: ['material', 'dimensions', 'description', 'openSCAD']
                    }
                }
            });
            const spec = JSON.parse(response.text || "{}");
            const img = await this.generateProductImage(`3D CAD render of enclosure: ${spec.description}. Minimalist industrial design.`);
            return { ...spec, renderUrl: img };
        } catch (e) { return null; }
    }

    async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
        try {
            const ai = this.getClient();
            const step = plan.steps.find(s => s.stepNumber === currentStep);
            const imageData = this.cleanBase64(image);
            if (!imageData) return "Unable to process camera frame.";

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                contents: {
                    parts: [
                        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
                        { text: `AR ASSEMBLY GUIDE: Current Step ${currentStep}: ${step?.description}. Analyzing frame...` }
                    ]
                }
            });
            return response.text || "Continue with the assembly step.";
        } catch (e) { return "Guidance temporarily unavailable."; }
    }

    async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: import('./aiTypes.ts').AuditAction[], summary: string }> {
        try {
            const ai = this.getClient();
            const digest = bom.map(b =>
                `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}) - $${b.part.price}`
            ).join('\n');

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `You are a hardware engineering audit assistant. Based on the audit results below, determine the EXACT changes needed to the Bill of Materials.

DESIGN REQUIREMENTS: ${requirements}

CURRENT BOM:
${digest}

AUDIT RESULT:
${auditResult}

Based ONLY on what the audit explicitly recommends, produce the list of actions. For addPart actions, use descriptive kebab-case IDs and real component names. For removePart actions, use the exact instanceId from the BOM above. Only include changes that directly address audit findings. If no changes are needed, return an empty actions array.`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            actions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: { type: Type.STRING, enum: ['addPart', 'removePart'] },
                                        partId: { type: Type.STRING },
                                        name: { type: Type.STRING },
                                        category: { type: Type.STRING },
                                        quantity: { type: Type.NUMBER },
                                        instanceId: { type: Type.STRING },
                                        reason: { type: Type.STRING }
                                    },
                                    required: ['type', 'reason']
                                }
                            },
                            summary: { type: Type.STRING }
                        },
                        required: ['actions', 'summary']
                    }
                }
            });

            const data = JSON.parse(response.text || '{"actions":[],"summary":"No changes recommended."}');
            return data;
        } catch (e: any) {
            console.error('[GeminiService] applyAuditRecommendations failed:', e);
            throw new Error(`Failed to extract audit recommendations: ${e.message}`);
        }
    }

    async identifyComponent(image: string): Promise<ComponentIdentification | null> {
        try {
            const ai = this.getClient();
            const imageData = this.cleanBase64(image);
            if (!imageData) return null;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: {
                    parts: [
                        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
                        { text: `Identify this hardware component from the photo. Determine:
1. What the component is (name, category, brand if visible)
2. Physical condition assessment (Excellent/Good/Fair/Poor)
3. Any visible defects or wear
4. Estimated retail price in USD
5. A suggested kebab-case part ID
6. Technical description and specifications
7. Physical/electrical ports and connectors visible

Be specific and accurate. If you can identify the exact manufacturer and model, do so.` }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            category: { type: Type.STRING },
                            brand: { type: Type.STRING },
                            condition: { type: Type.STRING },
                            conditionNotes: { type: Type.STRING },
                            defects: { type: Type.ARRAY, items: { type: Type.STRING } },
                            estimatedPrice: { type: Type.NUMBER },
                            suggestedPartId: { type: Type.STRING },
                            description: { type: Type.STRING },
                            ports: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        type: { type: Type.STRING },
                                        gender: { type: Type.STRING },
                                        spec: { type: Type.STRING }
                                    },
                                    required: ['name', 'type', 'gender', 'spec']
                                }
                            }
                        },
                        required: ['name', 'category', 'brand', 'condition', 'conditionNotes', 'defects', 'estimatedPrice', 'suggestedPartId', 'description', 'ports']
                    }
                }
            });
            const data = JSON.parse(response.text || "null");
            if (!data) return null;
            // Normalize port enums
            if (data.ports) {
                data.ports = data.ports.map((p: any) => ({
                    ...p,
                    type: (['MECHANICAL', 'ELECTRICAL', 'DATA', 'FLUID'].includes(p.type?.toUpperCase()) ? p.type.toUpperCase() : 'ELECTRICAL'),
                    gender: (['MALE', 'FEMALE', 'NEUTRAL'].includes(p.gender?.toUpperCase()) ? p.gender.toUpperCase() : 'NEUTRAL')
                }));
            }
            return data as ComponentIdentification;
        } catch (e) {
            console.error('[GeminiService] identifyComponent failed:', e);
            return null;
        }
    }
}
