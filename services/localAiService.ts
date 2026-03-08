import { AIService, ArchitectResponse } from "./aiTypes.ts";
import { GeminiService } from "./geminiService.ts";

export interface LocalModelProvider {
    id: string;
    name: string;
    endpointUrl: string; // e.g., 'http://192.168.1.41:1234/v1/chat/completions'
    type: 'openai' | 'ollama'; // Though Ollama supports openai format too
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

    async askArchitect(prompt: string, history: any[], image?: string): Promise<string> {
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
            return data.choices?.[0]?.message?.content || "Local model provided no output.";
        } catch (error: any) {
            console.error("[LocalArchitectService] askArchitect Failed:", error);
            throw new Error(`Local Service Error: ${error.message || JSON.stringify(error)}`);
        }
    }

    parseArchitectResponse(text: string): ArchitectResponse {
        // Reuse GeminiService's excellent regex parsing
        return this.geminiParser.parseArchitectResponse(text);
    }
}
