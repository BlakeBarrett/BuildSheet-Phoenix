import { AIService, ArchitectResponse, AskArchitectResult } from "./aiTypes.ts";
import { GeminiService } from "./geminiService.ts";
import { AssemblyPlan, AdvancedValidationOption } from "../types.ts";

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

// Local service handles askArchitect via LM Studio or Ollama (OpenAI compatible)
export class LocalArchitectService {
    public isOffline = false;

    constructor(private provider: LocalModelProvider, private geminiParser: GeminiService) { }

    public get name() {
        return `Local: ${this.provider.name}`;
    }

    public getApiKeyStatus(): string {
        return `Local URL: ${this.provider.endpointUrl}`;
    }

    async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
        try {
            // Reformat history from Gemini's {role: 'user'|'model', parts: [{text: ...}]}
            // to OpenAI's {role: 'user'|'assistant', content: ...}
            const messages = history.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts.map((p: any) => p.text).join('\n')
            }));

            // Add the new prompt
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

            // We also need the system prompt to guide the output
            messages.unshift({
                role: 'system',
                content: `ROLE: You are Gemini, the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 
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
                temperature: 0.7,
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
        // Reuse GeminiService's excellent regex parsing
        return this.geminiParser.parseArchitectResponse(text);
    }

    /**
     * Run a validation audit against a local model.
     * Sends the BOM digest + requirements and expects a textual audit response.
     */
    async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: import('./aiTypes.ts').AuditAction[] }> {
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

            const body = {
                model: this.provider.id,
                messages: [
                    { role: 'system', content: 'You are a senior hardware engineering auditor. Verify build feasibility and recommend BOM changes as structured JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 8192,
            };

            const response = await fetch(this.provider.endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer local-key' },
                body: JSON.stringify(body)
            });

            if (!response.ok) throw new Error(`Local API Error (${response.status})`);

            const data = await response.json();
            const fullText = data.choices?.[0]?.message?.content || '';

            let auditText = fullText;
            let auditActions: import('./aiTypes.ts').AuditAction[] | undefined;
            const delimiterIndex = fullText.indexOf('===ACTIONS_JSON===');
            if (delimiterIndex !== -1) {
                auditText = fullText.substring(0, delimiterIndex).trim();
                let jsonPart = fullText.substring(delimiterIndex + '===ACTIONS_JSON==='.length).trim();
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

    /**
     * Generate an assembly plan via local model.
     */
    async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
        try {
            const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
            let prompt = `Generate a robotic assembly plan for:\n${bomDigest}\n\nReturn JSON with: steps (stepNumber, description, requiredTool, estimatedTime), totalTime, difficulty (Easy/Medium/Hard/Expert), requiredEndEffectors, automationFeasibility (0-100), notes.`;

            if (previousPlan) {
                prompt += `\n\nUpdate this based on the new BOM.`;
            }

            const body = {
                model: this.provider.id,
                messages: [
                    { role: 'system', content: 'You are a robotics assembly planner. Output valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 8192,
            };

            const response = await fetch(this.provider.endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer local-key' },
                body: JSON.stringify(body)
            });

            if (!response.ok) throw new Error(`Local API Error (${response.status})`);

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            // Extract JSON from the response
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
}
