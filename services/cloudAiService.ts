import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { AIService, ArchitectResponse, AskArchitectResult, ComponentIdentification } from "./aiTypes.ts";
import { parseArchitectResponse } from "./parseUtils.ts";
import { Part, ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec, PortType, Gender } from "../types.ts";
import { AIManager } from "./aiManager.ts";
import { getAiTemperature } from "./localAiService.ts";
import { MODEL_FAST, MODEL_SMART, MODEL_STRUCTURED, MODEL_IMAGE, MODEL_AUDIO, getCloudAiDisplayName, getAiProvider, getAiBaseUrl, getAiImageBaseUrl } from "./aiConfig.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are BuildSheet AI, the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 

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

const AUDIT_SYSTEM_INSTRUCTION = `You are a senior hardware engineering auditor at BuildSheet.

PRIMARY OBJECTIVE: Verify that a given Bill of Materials (BOM) will produce a functional, buildable system.

CRITICAL — COMPATIBILITY CROSS-CHECK:
Every single part in the BOM MUST be verified against the DESIGN CONTEXT.
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

OUTPUT FORMAT:
After your audit text, you MUST append a structured JSON block with the exact BOM changes you recommend.
Use the delimiter ===ACTIONS_JSON=== on its own line, followed by a JSON object with this exact format:
{"actions":[{"type":"addPart","partId":"kebab-id","name":"Full Name","category":"Category","quantity":1,"reason":"Why"},{"type":"removePart","instanceId":"exact-instance-id-from-bom","name":"Part Name","reason":"Why"}],"summary":"Brief summary"}

For removePart actions, use the EXACT instanceId from the BOM.
For addPart actions, use descriptive kebab-case IDs and real component names.
If no changes are needed, use: {"actions":[],"summary":"No changes needed."}
The JSON block MUST be valid JSON. Do not wrap it in markdown code fences.
`;

export class CloudAIService implements AIService {
    public name = getCloudAiDisplayName();
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



    // ---------------------------------------------------------------------------
    // On-prem (OpenAI-compatible) helpers (used when AI_PROVIDER=on-prem)
    // ---------------------------------------------------------------------------

    /**
     * Generic OpenAI-compatible chat completions call.
     * Handles text, vision (base64 images), JSON mode, and conversation history.
     */
    private async openAiChat(options: {
        model: string;
        system?: string;
        /** Gemini-style history array [{role, parts}] — converted automatically. */
        history?: any[];
        /** Simple text prompt OR OpenAI content array (for vision). */
        userContent: string | Array<{ type: string; [k: string]: any }>;
        temperature?: number;
        maxTokens?: number;
        jsonMode?: boolean;
    }): Promise<string> {
        const messages: any[] = [];

        if (options.system) {
            messages.push({ role: 'system', content: options.system });
        }
        if (options.history) {
            for (const h of options.history) {
                const role = h.role === 'model' ? 'assistant' : h.role;
                const content = Array.isArray(h.parts)
                    ? h.parts.map((p: any) => p.text || '').join('')
                    : (h.content ?? '');
                messages.push({ role, content });
            }
        }
        messages.push({ role: 'user', content: options.userContent });

        // Route through the server proxy so the API key and base URL stay server-side.
        // In dev, Vite proxies /api → localhost:8081; in prod, nginx does the same.
        const endpoint = options.jsonMode ? '/api/v1/ai/generate-structured' : '/api/v1/ai/chat';
        const body: any = {
            model: options.model,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4096,
        };

        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`AI Service Error (${resp.status}): ${errText.substring(0, 300)}`);
        }
        const data = await resp.json();
        return data.choices?.[0]?.message?.content ?? '';
    }

    /**
     * DashScope Wan2.6 async text-to-image generation.
     * Submits a task, polls until SUCCEEDED or timeout, returns a base64 data URL.
     */
    private async dashScopeGenerateImage(prompt: string): Promise<string | null> {
        try {
            const imageBase = getAiImageBaseUrl();
            const apiKey = this.getApiKey();
            const submitUrl = `${imageBase}/services/aigc/image-generation/generation`;
            const body = {
                model: MODEL_IMAGE,
                input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
                parameters: { n: 1, size: '1024*1024' },
            };
            console.log(`[DashScope] POST ${submitUrl} model=${MODEL_IMAGE}`);
            const resp = await fetch(submitUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'X-DashScope-Async': 'enable',
                },
                body: JSON.stringify(body),
            });
            const data = await resp.json();
            console.log(`[DashScope] Submit response ${resp.status}:`, JSON.stringify(data));
            if (!resp.ok) return null;

            const taskId = data.output?.task_id;
            if (!taskId) {
                console.error('[DashScope] No task_id in response');
                return null;
            }

            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const pollUrl = `${imageBase}/tasks/${taskId}`;
                const pollResp = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                const pollData = await pollResp.json();
                const status = pollData.output?.task_status;
                console.log(`[DashScope] Poll ${i + 1}: status=${status}`);
                if (!pollResp.ok) return null;
                if (status === 'SUCCEEDED') {
                    const imageUrl = pollData.output?.choices?.[0]?.message?.content?.[0]?.image;
                    if (!imageUrl) {
                        console.error('[DashScope] SUCCEEDED but no URL:', JSON.stringify(pollData));
                        return null;
                    }
                    return await this.fetchImageAsDataUrl(imageUrl);
                }
                if (status === 'FAILED' || status === 'CANCELED') {
                    console.error('[DashScope] Task failed/canceled:', JSON.stringify(pollData));
                    return null;
                }
            }
            console.error('[DashScope] Timed out waiting for task', taskId);
            return null;
        } catch (e) {
            console.error('[DashScope] dashScopeGenerateImage threw:', e);
            return null;
        }
    }

    private async fetchImageAsDataUrl(url: string): Promise<string | null> {
        const imgResp = await fetch(url);
        if (!imgResp.ok) return null;
        const blob = await imgResp.blob();
        return new Promise<string | null>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }



    public getApiKeyStatus(): string {
        const key = this.getApiKey();
        if (!key) return "MISSING";
        return `${key.substring(0, 4)}... (Len: ${key.length})`;
    }

    /**
     * General-purpose structured JSON generation.
     * Used by the procurement engine's verification stage.
     */
    async generateStructuredJson(prompt: string, schema: Record<string, any>): Promise<any> {
        if (getAiProvider() === 'on-prem') {
            const text = await this.openAiChat({
                model: MODEL_STRUCTURED,
                userContent: prompt,
                jsonMode: true,
                maxTokens: 4096,
            });
            return JSON.parse(text || 'null');
        }
        const ai = this.getClient();
        const response = await ai.models.generateContent({
            model: MODEL_STRUCTURED,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema as any,
            },
        });
        return JSON.parse(response.text || 'null');
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
            if (getAiProvider() === 'on-prem') {
                let userContent: string | Array<{ type: string; [k: string]: any }>;
                if (image) {
                    const imageData = this.cleanBase64(image);
                    const parts: any[] = [{ type: 'text', text: prompt }];
                    if (imageData) parts.unshift({ type: 'image_url', image_url: { url: image } });
                    userContent = parts;
                } else {
                    userContent = prompt;
                }
                const text = await this.openAiChat({
                    model: MODEL_FAST,
                    system: SYSTEM_INSTRUCTION,
                    history,
                    userContent,
                    temperature: getAiTemperature(0.7),
                    maxTokens: 4096,
                });
                return {
                    text: text || 'AI service provided no output.',
                    metadata: { model: MODEL_FAST }
                };
            }

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
                model: MODEL_FAST,
                contents,
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    temperature: getAiTemperature(0.7),
                },
            });

            return {
                text: response.text || "AI service provided no output.",
                metadata: {
                    model: MODEL_FAST,
                    tokens: response.usageMetadata?.totalTokenCount
                }
            };
        } catch (error: any) {
            console.error("[CloudAIService] askArchitect Failed:", error);
            const keyStatus = this.getApiKeyStatus();
            if (error.status === 400 || error.message?.includes('400')) {
                throw new Error(`AI Service Error (400): ${error.message}. (Key Used: ${keyStatus}). Check Cloud Run configuration and API key restrictions.`);
            }
            throw new Error(`AI Service Error: ${error.message || JSON.stringify(error)}`);
        }
    }

    parseArchitectResponse(text: string): ArchitectResponse {
        return parseArchitectResponse(text);
    }

    async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
        try {
            if (getAiProvider() === 'on-prem') {
                return await this.dashScopeGenerateImage(description);
            }
            const ai = this.getClient();
            const parts: any[] = [{ text: `Product design concept sketch: ${description}` }];
            if (referenceImage) {
                const imageData = this.cleanBase64(referenceImage);
                if (imageData) parts.unshift({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
            }
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: MODEL_IMAGE,
                contents: { parts }
            });
            const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            return part ? `data:${part.inlineData!.mimeType || 'image/png'};base64,${part.inlineData!.data}` : null;
        } catch (e) { return null; }
    }

    // NOTE: findPartSources, hydratePartDetails, and findLocalSuppliers have been
    // moved to the server-side SearchService. Use sourcingApi from apiClient.ts.

    async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: import('../types.ts').AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: import('./aiTypes.ts').AuditAction[] }> {
        try {
            const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}, Brand: ${b.part.brand || 'TBD'}) - Price: $${b.part.price} - Description: ${b.part.description}`).join('\n');
            const enabledAdvanced = (advancedChecks || []).filter(c => c.enabled);

            let prompt = `DESIGN CONTEXT/REQUIREMENTS: ${requirements}\n\nCURRENT BILL OF MATERIALS:\n${digest}\n`;

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
                        prompt += `\n### ${check.label}\nResearch and validate: "${check.label}". Provide a thorough assessment of compliance or applicability.\n`;
                    }
                }
            }

            if (previousAudit) {
                prompt += `\nPREVIOUS AUDIT RESULT:\n${previousAudit}\n`;
            }

            let fullText: string;

            if (getAiProvider() === 'on-prem') {
                fullText = await this.openAiChat({
                    model: MODEL_SMART,
                    system: AUDIT_SYSTEM_INSTRUCTION,
                    userContent: prompt,
                    maxTokens: 8192,
                });
            } else {
                const ai = this.getClient();
                const thinkingBudget = enabledAdvanced.length > 0 ? 4096 : 2048;
                const response = await ai.models.generateContent({
                    model: MODEL_SMART,
                    contents: prompt,
                    config: {
                        systemInstruction: AUDIT_SYSTEM_INSTRUCTION,
                        maxOutputTokens: 8192,
                        thinkingConfig: { thinkingBudget }
                    }
                });
                fullText = response.text || "";
            }

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
                        console.warn('[CloudAIService] Failed to parse audit actions JSON:', jsonErr);
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
            const system = 'You are a senior manufacturing engineer. Provide detailed fabrication specifications including materials, tolerances, surface finishes, and manufacturing processes.';
            const contents = `Manufacturing specs for: ${partName}. Context: ${context}.`;
            let text: string;
            if (getAiProvider() === 'on-prem') {
                text = await this.openAiChat({ model: MODEL_SMART, system, userContent: contents, maxTokens: 4096 });
            } else {
                const ai = this.getClient();
                const response = await ai.models.generateContent({
                    model: MODEL_SMART,
                    contents,
                    config: { systemInstruction: system, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 2048 } }
                });
                text = response.text || '';
            }
            const img = await this.generateProductImage(`Engineering blueprint diagram of ${partName}. Orthographic projections.`);
            return (img ? `![Technical Blueprint](${img})\n\n` : '') + (text || '');
        } catch (e: any) { return `Generation failed: ${e.message}`; }
    }

    async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
        try {
            const system = 'You are a quality assurance engineer. Generate inspection protocols as structured JSON with keys: recommendedSensors (string[]), inspectionStrategy (string), defects (array of {name, severity, description}).';
            const contents = `QA protocol for: ${partName} (category: ${category}).`;
            if (getAiProvider() === 'on-prem') {
                const text = await this.openAiChat({ model: MODEL_FAST, system, userContent: contents, jsonMode: true, maxTokens: 2048 });
                return JSON.parse(text || 'null');
            }
            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents,
                config: {
                    systemInstruction: 'You are a quality assurance engineer. Generate inspection protocols as structured JSON.',
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
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            let prompt = `Generate a robotic assembly plan for the following components:\n${bomDigest}`;
            if (previousPlan) {
                prompt += `\n\n--- PREVIOUS PLAN ---\nUpdate this plan based on the new BOM.`;
            }
            const assemblySystem = `You are a robotics assembly planner. Generate detailed assembly plans as structured JSON.
For automationFeasibility (0-100), score how practical it is to assemble with standard industrial robotic arms and off-the-shelf end-effectors. Use this scale:
- 90-100: Simple pick-and-place, snap-fit, or screw fastening of rigid, uniform parts (e.g. PCB mounting, connector insertion)
- 70-89: Standard assembly requiring moderate dexterity or tool changes (e.g. cable routing with clips, heat-sink mounting)
- 50-69: Complex assembly needing specialized fixtures or force-feedback (e.g. flex-cable threading, adhesive application)
- 30-49: Highly dexterous or non-deterministic tasks (e.g. hand-soldering, conformal coating)
- 0-29: Practically infeasible to automate (e.g. field wiring in confined spaces)
Most consumer-electronics and maker-project assemblies should score 70+.
Return JSON with keys: steps (array of {stepNumber,description,requiredTool,estimatedTime}), totalTime, difficulty, requiredEndEffectors, automationFeasibility, notes.`;

            if (getAiProvider() === 'on-prem') {
                const text = await this.openAiChat({ model: MODEL_SMART, system: assemblySystem, userContent: prompt, jsonMode: true, maxTokens: 4096 });
                const plan = JSON.parse(text || 'null');
                if (plan) plan.generatedAt = new Date();
                return plan;
            }

            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: MODEL_SMART,
                contents: prompt,
                config: {
                    systemInstruction: assemblySystem,
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
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            const enclosureContents = `Generate a 3D printable enclosure or custom adapter specification for this project. Context: ${context}. Components: ${bomDigest}`;
            const enclosureSystem = 'You are an expert mechanical engineer and OpenSCAD programmer. Generate parametric, manufacturable enclosure designs. You MUST output raw OpenSCAD code for transparency and manufacturing. Return JSON with keys: material, dimensions, openSCAD, description.';

            let spec: any;
            if (getAiProvider() === 'on-prem') {
                const text = await this.openAiChat({ model: MODEL_SMART, system: enclosureSystem, userContent: enclosureContents, jsonMode: true, maxTokens: 8192 });
                spec = JSON.parse(text || '{}');
            } else {
                const ai = this.getClient();
                const response = await ai.models.generateContent({
                    model: MODEL_SMART,
                    contents: enclosureContents,
                    config: {
                        systemInstruction: 'You are an expert mechanical engineer and OpenSCAD programmer. Generate parametric, manufacturable enclosure designs. You MUST output raw OpenSCAD code for transparency and manufacturing.',
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
                spec = JSON.parse(response.text || '{}');
            }
            const img = await this.generateProductImage(`3D CAD render of enclosure: ${spec.description}. Minimalist industrial design.`);
            return { ...spec, renderUrl: img };
        } catch (e) { return null; }
    }

    async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
        try {
            const step = plan.steps.find(s => s.stepNumber === currentStep);
            const imageData = this.cleanBase64(image);
            if (!imageData) return "Unable to process camera frame.";
            const arSystem = 'You are an AR assembly guidance system. Analyze the camera frame and provide concise, actionable assembly instructions for the current step.';
            const stepText = `Current Step ${currentStep}: ${step?.description}. Analyze this frame and guide the user.`;

            if (getAiProvider() === 'on-prem') {
                const text = await this.openAiChat({
                    model: MODEL_FAST,
                    system: arSystem,
                    userContent: [
                        { type: 'image_url', image_url: { url: image } },
                        { type: 'text', text: stepText },
                    ],
                    maxTokens: 512,
                });
                return text || "Continue with the assembly step.";
            }

            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: MODEL_AUDIO,
                contents: {
                    parts: [
                        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
                        { text: stepText }
                    ]
                },
                config: { systemInstruction: arSystem }
            });
            return response.text || "Continue with the assembly step.";
        } catch (e) { return "Guidance temporarily unavailable."; }
    }

    async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: import('./aiTypes.ts').AuditAction[], summary: string }> {
        try {
            const digest = bom.map(b =>
                `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}) - $${b.part.price}`
            ).join('\n');

            const auditPrompt = `DESIGN REQUIREMENTS: ${requirements}\n\nCURRENT BOM:\n${digest}\n\nAUDIT RESULT:\n${auditResult}\n\nBased ONLY on what the audit explicitly recommends, produce the list of actions. For addPart actions, use descriptive kebab-case IDs and real component names. For removePart actions, use the exact instanceId from the BOM above. Only include changes that directly address audit findings. If no changes are needed, return an empty actions array.`;
            const auditSystem = 'You are a hardware engineering audit assistant. Extract concrete BOM changes from audit results. Only include changes that directly address audit findings. Return JSON with keys: actions (array of {type,partId,name,category,quantity,instanceId,reason}), summary.';

            if (getAiProvider() === 'on-prem') {
                const text = await this.openAiChat({ model: MODEL_FAST, system: auditSystem, userContent: auditPrompt, jsonMode: true, maxTokens: 2048 });
                const data = JSON.parse(text || '{"actions":[],"summary":"No changes recommended."}');
                return data;
            }

            const ai = this.getClient();
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: auditPrompt,
                config: {
                    systemInstruction: 'You are a hardware engineering audit assistant. Extract concrete BOM changes from audit results. Only include changes that directly address audit findings.',
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
            console.error('[CloudAIService] applyAuditRecommendations failed:', e);
            throw new Error(`Failed to extract audit recommendations: ${e.message}`);
        }
    }

    async identifyComponent(image: string): Promise<ComponentIdentification | null> {
        try {
            const imageData = this.cleanBase64(image);
            if (!imageData) return null;
            const identifySystem = `You are a hardware component identification specialist. Identify components from photos and return structured data.
Determine: 1) name, category, brand if visible, 2) physical condition (Excellent/Good/Fair/Poor), 3) visible defects or wear, 4) estimated retail price in USD, 5) a suggested kebab-case part ID, 6) technical description and specifications, 7) physical/electrical ports and connectors visible.
Be specific and accurate. If you can identify the exact manufacturer and model, do so.
Return JSON with keys: name, category, brand, condition, conditionNotes, defects (string[]), estimatedPrice (number), suggestedPartId, description, ports (array of {name,type,gender,spec}).`;

            let data: any;

            if (getAiProvider() === 'on-prem') {
                const text = await this.openAiChat({
                    model: MODEL_FAST,
                    system: identifySystem,
                    userContent: [
                        { type: 'image_url', image_url: { url: image } },
                        { type: 'text', text: 'Identify this hardware component from the photo.' },
                    ],
                    jsonMode: true,
                    maxTokens: 2048,
                });
                data = JSON.parse(text || 'null');
            } else {
                const ai = this.getClient();
                const response = await ai.models.generateContent({
                    model: MODEL_FAST,
                    contents: {
                        parts: [
                            { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
                            { text: `Identify this hardware component from the photo.` }
                        ]
                    },
                    config: {
                        systemInstruction: identifySystem,
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
                data = JSON.parse(response.text || "null");
            }

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
            console.error('[CloudAIService] identifyComponent failed:', e);
            return null;
        }
    }
}
