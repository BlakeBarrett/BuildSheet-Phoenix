import { AIService, ArchitectResponse, AskArchitectResult, AuditAction, ComponentIdentification } from "./aiTypes.ts";
import { parseArchitectResponse } from "./parseUtils.ts";
import { AssemblyPlan, AdvancedValidationOption, InspectionProtocol, EnclosureSpec, ShoppingOption, LocalSupplier, Part, PortType, Gender } from "../types.ts";

export interface LocalModelProvider {
    id: string;
    name: string;
    endpointUrl: string; // e.g., 'http://192.168.1.41:1234/v1/chat/completions'
    type: 'openai' | 'ollama'; // Though Ollama supports openai format too
}

/**
 * Read a saved local model provider from localStorage.
 */
export function getLocalProvider(key: string): LocalModelProvider | null {
    try {
        const saved = localStorage.getItem(key);
        if (saved) return JSON.parse(saved);
    } catch { /* noop */ }
    return null;
}

/**
 * Read the user's preferred AI temperature from localStorage.
 * Falls back to the given default (0.7 for chat, 0.3 for audits).
 */
export function getAiTemperature(fallback = 0.7): number {
    try {
        const saved = localStorage.getItem('aiTemperature');
        if (saved) return parseFloat(saved);
    } catch { /* noop */ }
    return fallback;
}

// ---- Internal helper ----

/**
 * Makes a request to a local OpenAI-compatible endpoint.
 */
async function localChatCompletion(
    provider: LocalModelProvider,
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; max_tokens?: number; image?: string } = {}
): Promise<string> {
    const userContent: any[] = [{ type: 'text', text: userPrompt }];
    if (options.image) {
        userContent.push({
            type: 'image_url',
            image_url: { url: options.image }
        });
    }

    const body = {
        model: provider.id,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ],
        temperature: options.temperature ?? getAiTemperature(0.7),
        max_tokens: options.max_tokens ?? 4096,
    };

    const response = await fetch(provider.endpointUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer local-key'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Local API Error (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

/**
 * Attempts to parse JSON from LLM output, stripping markdown fences if present.
 */
function extractJson<T>(text: string): T | null {
    if (!text) return null;
    // Strip markdown code fences
    let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    // Try direct parse first
    try { return JSON.parse(cleaned); } catch { /* continue */ }
    // Try to find a JSON object in the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch { /* give up */ }
    }
    return null;
}

// ---- Service ----

/**
 * LocalArchitectService handles ALL generation tasks via a local
 * OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, etc.)
 *
 * Search-grounded tasks (findPartSources, findLocalSuppliers, hydratePartDetails)
 * are intentionally NOT implemented here — those always route through Cloud API / future VertexAI.
 */
export class LocalArchitectService {
    public isOffline = false;

    constructor(private provider: LocalModelProvider) { }

    public get name() {
        return `Local: ${this.provider.name}`;
    }

    public getApiKeyStatus(): string {
        return `Local URL: ${this.provider.endpointUrl}`;
    }

    // ---- Architect Chat ----

    async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
        try {
            // Reformat history from cloud API {role: 'user'|'model', parts: [{text: ...}]}
            // to OpenAI's {role: 'user'|'assistant', content: ...}
            const messages = history.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts.map((p: any) => p.text).join('\n')
            }));

            const userContent: any[] = [{ type: 'text', text: prompt }];
            if (image) {
                userContent.push({
                    type: 'image_url',
                    image_url: { url: image }
                });
            }

            messages.push({
                role: 'user',
                content: userContent
            });

            messages.unshift({
                role: 'system',
                content: `ROLE: You are the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 
CORE DIRECTIVE: You are a FUNCTIONAL AGENT. Your primary job is to Manipulate the State of the drafting board using Tools.
DO NOT just describe the build in text. You MUST call \`initializeDraft\` and \`addPart\` commands to actually create the BOM.

PART SCHEMA:
Each part you add must conform to this schema:
- **id**: A descriptive kebab-case identifier (e.g. "esp32-wroom-32d").
- **name**: The full human-readable product name.
- **category**: The part category.
- **ports**: (Reason about compatibility in your summary).

BEHAVIOR:
1. When a user asks to build something new, you MUST call \`initializeDraft(name, requirements)\` first.
2. OUTPUT FORMAT: Provide a brief reasoning summary. Append Tool Calls at the end. DO NOT label them with "Tool Calls:".
Syntax: \`addPart("id", "name", "category", quantity)\`
TOOLS:
- \`initializeDraft(name, requirements)\`
- \`addPart(id, name, category, quantity)\`
- \`removePart(instanceId)\``
            });

            const body = {
                model: this.provider.id,
                messages: messages,
                temperature: getAiTemperature(0.7),
                max_tokens: 4096,
            };

            const response = await fetch(this.provider.endpointUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer local-key'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Local API Error (${response.status}): ${text}`);
            }

            const data = await response.json();
            return {
                text: data.choices?.[0]?.message?.content || "Local model provided no output.",
                metadata: {
                    model: this.provider.id,
                    tokens: data.usage?.total_tokens
                }
            };
        } catch (error: any) {
            console.error("[LocalArchitectService] askArchitect Failed:", error);
            throw new Error(`Local Service Error: ${error.message || JSON.stringify(error)}`);
        }
    }

    parseArchitectResponse(text: string): ArchitectResponse {
        return parseArchitectResponse(text);
    }

    // ---- Validation Audit ----

    async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: AuditAction[] }> {
        try {
            const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}, Brand: ${b.part.brand || 'TBD'}) - Price: $${b.part.price}`).join('\n');
            const enabledAdvanced = (advancedChecks || []).filter(c => c.enabled);

            let prompt = `PERFORM A BUILD FEASIBILITY CHECK.\nVerify the following BOM produces a functional, buildable system.\n\nFocus on:\n1. Platform/make/model mismatch\n2. Missing critical parts\n3. Incompatible connections\n4. Quantity errors\n5. Engineering issues\n\nDESIGN REQUIREMENTS: ${requirements}\n\nBILL OF MATERIALS:\n${digest}\n`;

            if (enabledAdvanced.length > 0) {
                prompt += `\n--- ADVANCED CHECKS ---\n`;
                for (const check of enabledAdvanced) {
                    prompt += `- ${check.label}\n`;
                }
            }

            prompt += `\nAfter your audit, append:\n===ACTIONS_JSON===\n{"actions":[...],"summary":"..."}\nUse addPart/removePart action types.`;

            if (previousAudit) {
                prompt += `\n\nPREVIOUS AUDIT:\n${previousAudit}`;
            }

            const text = await localChatCompletion(
                this.provider,
                'You are a senior hardware engineering auditor. Verify build feasibility and recommend BOM changes as structured JSON.',
                prompt,
                { temperature: getAiTemperature(0.3), max_tokens: 8192 }
            );

            let auditText = text;
            let auditActions: AuditAction[] | undefined;
            const delimiterIndex = text.indexOf('===ACTIONS_JSON===');
            if (delimiterIndex !== -1) {
                auditText = text.substring(0, delimiterIndex).trim();
                let jsonPart = text.substring(delimiterIndex + '===ACTIONS_JSON==='.length).trim();
                jsonPart = jsonPart.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
                try {
                    const parsed = JSON.parse(jsonPart);
                    if (parsed.actions && Array.isArray(parsed.actions)) auditActions = parsed.actions;
                } catch { /* fallback */ }
            }

            return { ...this.parseArchitectResponse(auditText), auditActions };
        } catch (error: any) {
            return { reasoning: `Local audit failed: ${error.message}`, toolCalls: [] };
        }
    }

    // ---- Assembly Plan ----

    async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
        try {
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            let prompt = `Generate a robotic assembly plan for:\n${bomDigest}\n\nReturn JSON with: steps (stepNumber, description, requiredTool, estimatedTime), totalTime, difficulty (Easy/Medium/Hard/Expert), requiredEndEffectors, automationFeasibility (0-100), notes.`;

            if (previousPlan) {
                prompt += `\n\nUpdate this based on the new BOM.`;
            }

            const text = await localChatCompletion(
                this.provider,
                'You are a robotics assembly planner. Output valid JSON only.',
                prompt,
                { temperature: getAiTemperature(0.3), max_tokens: 8192 }
            );

            const jsonMatch = text.match(/\{[\s\S]*"steps"[\s\S]*\}/);
            if (jsonMatch) {
                const plan = JSON.parse(jsonMatch[0]);
                plan.generatedAt = new Date();
                return plan;
            }
            return null;
        } catch (error: any) {
            console.error("[LocalArchitectService] generateAssemblyPlan Failed:", error);
            return null;
        }
    }

    // ---- Enclosure / CAD (OpenSCAD) ----

    async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
        try {
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            const prompt = `Generate a 3D printable enclosure or custom adapter specification for this project. You MUST output raw OpenSCAD code for transparency and manufacturing.

Context: ${context}
Components: ${bomDigest}

Return valid JSON with these exact fields:
- "material": recommended 3D printing material (string)
- "dimensions": overall dimensions (string)
- "openSCAD": complete OpenSCAD source code (string)
- "description": brief description of the enclosure design (string)`;

            const text = await localChatCompletion(
                this.provider,
                'You are an expert mechanical engineer and OpenSCAD programmer. Generate parametric, manufacturable enclosure designs. Output valid JSON only.',
                prompt,
                { temperature: getAiTemperature(0.3), max_tokens: 8192 }
            );

            const spec = extractJson<EnclosureSpec>(text);
            if (spec) {
                // No image generation capability locally — renderUrl stays undefined
                return spec;
            }
            return null;
        } catch (error: any) {
            console.error("[LocalArchitectService] generateEnclosure Failed:", error);
            return null;
        }
    }

    // ---- Fabrication Brief ----

    async generateFabricationBrief(partName: string, context: string): Promise<string> {
        try {
            const text = await localChatCompletion(
                this.provider,
                'You are a senior manufacturing engineer. Provide detailed fabrication specifications including materials, tolerances, surface finishes, and manufacturing processes.',
                `Manufacturing specs for: ${partName}. Context: ${context}.`,
                { temperature: getAiTemperature(0.3), max_tokens: 4096 }
            );
            return text || 'No fabrication brief generated.';
        } catch (error: any) {
            return `Fabrication brief generation failed: ${error.message}`;
        }
    }

    // ---- QA / Inspection Protocol ----

    async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
        try {
            const text = await localChatCompletion(
                this.provider,
                'You are a quality assurance engineer. Generate inspection protocols as valid JSON only.',
                `Generate a QA inspection protocol for: ${partName} (category: ${category}).

Return valid JSON with these exact fields:
- "recommendedSensors": array of sensor type strings
- "inspectionStrategy": string describing the approach
- "defects": array of objects with { "name": string, "severity": "Critical"|"Major"|"Minor", "description": string }`,
                { temperature: getAiTemperature(0.3), max_tokens: 4096 }
            );

            return extractJson<InspectionProtocol>(text);
        } catch (error: any) {
            console.error("[LocalArchitectService] generateQAProtocol Failed:", error);
            return null;
        }
    }

    // ---- AR Guidance ----

    async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
        try {
            const step = plan.steps.find(s => s.stepNumber === currentStep);
            const text = await localChatCompletion(
                this.provider,
                'You are an AR assembly guidance system. Analyze the camera frame and provide concise, actionable assembly instructions for the current step.',
                `AR ASSEMBLY GUIDE: Current Step ${currentStep}: ${step?.description}. Analyze the provided image and guide the user through this assembly step.`,
                { temperature: getAiTemperature(0.5), max_tokens: 2048, image }
            );
            return text || 'Continue with the assembly step.';
        } catch (error: any) {
            return 'Guidance temporarily unavailable.';
        }
    }

    // ---- Apply Audit Recommendations ----

    async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: AuditAction[], summary: string }> {
        try {
            const digest = bom.map(b =>
                `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}) - $${b.part.price}`
            ).join('\n');

            const text = await localChatCompletion(
                this.provider,
                'You are a hardware engineering audit assistant. Extract concrete BOM changes from audit results as valid JSON only.',
                `Based on the audit results below, determine the EXACT changes needed to the Bill of Materials.

DESIGN REQUIREMENTS: ${requirements}

CURRENT BOM:
${digest}

AUDIT RESULT:
${auditResult}

Return valid JSON with:
- "actions": array of { "type": "addPart"|"removePart", "partId"?: string, "name"?: string, "category"?: string, "quantity"?: number, "instanceId"?: string, "reason": string }
- "summary": brief summary string

For removePart actions, use the exact instanceId from the BOM. For addPart, use descriptive kebab-case IDs.`,
                { temperature: getAiTemperature(0.3), max_tokens: 4096 }
            );

            const result = extractJson<{ actions: AuditAction[], summary: string }>(text);
            return result || { actions: [], summary: 'No changes recommended.' };
        } catch (error: any) {
            console.error('[LocalArchitectService] applyAuditRecommendations failed:', error);
            throw new Error(`Failed to extract audit recommendations: ${error.message}`);
        }
    }

    // ---- Component Identification (Vision) ----

    async identifyComponent(image: string): Promise<ComponentIdentification | null> {
        try {
            const text = await localChatCompletion(
                this.provider,
                'You are a hardware component identification specialist. Identify components from photos and return structured data as valid JSON only.',
                `Identify this hardware component from the photo. Determine:
1. What the component is (name, category, brand if visible)
2. Physical condition assessment (Excellent/Good/Fair/Poor)
3. Any visible defects or wear
4. Estimated retail price in USD
5. A suggested kebab-case part ID
6. Technical description and specifications
7. Physical/electrical ports and connectors visible

Return valid JSON with fields: name, category, brand, condition, conditionNotes, defects (array), estimatedPrice, suggestedPartId, description, ports (array of {name, type, gender, spec})`,
                { temperature: getAiTemperature(0.3), max_tokens: 4096, image }
            );

            const data = extractJson<any>(text);
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
        } catch (error: any) {
            console.error('[LocalArchitectService] identifyComponent failed:', error);
            return null;
        }
    }

    // ---- Product Image ----
    // Local text models cannot generate images. Always returns null.

    async generateProductImage(_description: string, _referenceImage?: string): Promise<string | null> {
        return null;
    }
}
