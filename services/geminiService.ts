

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { HARDWARE_REGISTRY } from "../data/seedData.ts";
import { AIService, ArchitectResponse } from "./aiTypes.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are the Senior Hardware Architect at BuildSheet. You design complex systems.

CORE BEHAVIOR:
1. DESIGN-FIRST: Architect functional systems. "Yes, and..." philosophy.
2. HANDLING MISSING DATA: If parts aren't in registry, infer requirements and use addPart("generic-id", 1).
3. PHYSICAL REASONING: Describe exactly how parts mate (e.g., JST-PH 2.0 connectors).
4. MULTIMODAL ANALYSIS: If the user provides an image, analyze it for mechanical constraints, aesthetic style, or existing component identification.
5. NO FILLER, NO CODE: Start with analysis. Never use markdown code blocks.

TOOLS:
- initializeDraft(name: string, requirements: string)
- addPart(partId: string, quantity: number)
- removePart(instanceId: string)

REGISTRY CONTEXT:
${HARDWARE_REGISTRY ? HARDWARE_REGISTRY.map(p => {
  const ports = p.ports.map(pt => `${pt.name} (${pt.gender} ${pt.spec})`).join(', ');
  return `- ${p.id}: ${p.name} [Category: ${p.category}] | Ports: ${ports}`;
}).join('\n') : 'Registry Offline'}

EXAMPLE OUTPUT:
The system requires a battery stacked beneath the main PCB.
addPart("generic-battery", 1)
addPart("main-pcb", 1)
`;

export class GeminiService implements AIService {
  public name = "Gemini 3 Flash";
  public isOffline = false;
  private ai: GoogleGenAI;

  constructor() {
    // Uses process.env.API_KEY directly as mandated by protocol
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private cleanBase64(dataUrl: string): { mimeType: string, data: string } | null {
    try {
        const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return null;
        return { mimeType: matches[1], data: matches[2] };
    } catch (e) {
        return null;
    }
  }

  async askArchitect(prompt: string, history: any[], image?: string): Promise<string> {
    try {
      // Map internal history format to Gemini SDK format
      // history comes in as { role: 'user'|'model', parts: [...] } from App.tsx construction
      const contents = [...history];
      
      // Construct current turn
      const currentParts: any[] = [{ text: prompt }];
      
      if (image) {
        const imageData = this.cleanBase64(image);
        if (imageData) {
            currentParts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
        }
      }

      contents.push({ role: 'user', parts: currentParts });

      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2,
          topP: 0.8,
        }
      });

      return response.text || "";
    } catch (error: any) {
      console.error("Gemini SDK Error:", error);
      throw new Error(`Gemini Service Error: ${error.message}`);
    }
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    const toolCalls: any[] = [];
    if (!text) return { reasoning: "Architect provided no output.", toolCalls };

    let reasoning = text;

    // Parse initializeDraft
    const initMatch = text.match(/initializeDraft\s*\(\s*['"](.+?)['"]\s*,\s*['"](.+?)['"]\s*\)/);
    if (initMatch) {
      toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
      reasoning = reasoning.replace(initMatch[0], '');
    }

    try {
      // Parse addPart
      const addMatches = [...text.matchAll(/addPart\s*\(\s*['"](.+?)['"]\s*,\s*(\d+)\s*\)/g)];
      addMatches.forEach(m => {
          toolCalls.push({ type: 'addPart', partId: m[1], qty: parseInt(m[2]) });
          reasoning = reasoning.replace(m[0], '');
      });

      // Parse removePart
      const removeMatches = [...text.matchAll(/removePart\s*\(\s*['"](.+?)['"]\s*\)/g)];
      removeMatches.forEach(m => {
          toolCalls.push({ type: 'removePart', instanceId: m[1] });
          reasoning = reasoning.replace(m[0], '');
      });
    } catch (e) {
        console.error("Parsing Regex Error", e);
    }

    // Cleanup whitespace artifacts from removed tool calls
    // 1. Remove trailing spaces on lines
    // 2. Collapse 3+ newlines into 2 (paragraph break)
    // 3. Trim start/end
    reasoning = reasoning.replace(/[ \t]+$/gm, '');
    reasoning = reasoning.replace(/\n{3,}/g, '\n\n');

    return { reasoning: reasoning.trim(), toolCalls };
  }

  async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
    try {
        const parts: any[] = [
            { text: `Generate a high-quality product design concept sketch for: ${description}` }
        ];

        if (referenceImage) {
            const imageData = this.cleanBase64(referenceImage);
            if (imageData) {
                // Prepend image so model sees "This image + This text"
                parts.unshift({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
            }
        }

        // Using Gemini 2.5 Flash Image (Nano Banana) for generation
        const response: GenerateContentResponse = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                // Config tailored for visual output where supported
            }
        });
        
        // Check for inline data (Base64 image)
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (e) {
        console.warn("Image generation failed", e);
        return null;
    }
  }

  async findPartSources(query: string): Promise<{ options: { title: string; url: string; source: string }[] } | null> {
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Find purchase options for this hardware component: ${query}. Return a list of reliable vendors.`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        // Extract grounding chunks
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        if (!chunks || chunks.length === 0) return null;

        const options = chunks
            .filter((c: any) => c.web && c.web.uri)
            .map((c: any) => ({
                title: c.web.title || "Part Source",
                url: c.web.uri,
                source: new URL(c.web.uri).hostname
            }));

        return { options };
    } catch (e) {
        console.error("Sourcing lookup failed", e);
        return null;
    }
  }
}