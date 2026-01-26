import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { HARDWARE_REGISTRY } from "../data/seedData.ts";
import { AIService, ArchitectResponse } from "./aiTypes.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are the Senior Hardware Architect at BuildSheet. You design complex systems using the available Parts Registry.

CORE BEHAVIOR:
1. DESIGN-FIRST: Architect functional systems. "Yes, and..." philosophy.
2. HANDLING MISSING DATA: If parts aren't in registry, you MAY infer requirements using addPart("generic-id", qty), but PREFER existing parts.
3. COMPATIBILITY ENFORCEMENT: 
   - You MUST check the 'Ports' definition of parts in the Registry.
   - ONLY connect parts if they have compatible ports (e.g., MALE 'mx-socket' <-> FEMALE 'mx-socket').
   - DO NOT propose a BOM that is physically impossible (e.g., 2 male connectors).
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

EXAMPLE:
User: "I need a keyboard."
Reasoning: The user needs a keyboard. I see a PCB with 'mx-socket' ports and Switches with 'mx-socket' pins. These are compatible.
initializeDraft("Mechanical Keyboard", "65% Layout")
addPart("kb-pcb-1", 1)
addPart("kb-sw-1", 68)
addPart("kb-case-1", 1)
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
                parts.unshift({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
            }
        }

        const response: GenerateContentResponse = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {}
        });
        
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

  async verifyDesign(bom: any[], requirements: string): Promise<string> {
    try {
        // Simplified BOM for the model to digest
        const digest = bom.map(b => `${b.quantity}x ${b.part.name} (${b.part.sku}) - Ports: ${JSON.stringify(b.part.ports)}`).join('\n');
        
        const prompt = `
        PERFORM A DEEP TECHNICAL AUDIT ON THIS HARDWARE SYSTEM.
        
        DESIGN GOALS: ${requirements}
        
        BILL OF MATERIALS:
        ${digest}
        
        TASK:
        1. Identify voltage mismatches (e.g. 3.3v vs 5v logic).
        2. Identify physical connector mismatches (Male/Male, etc).
        3. Identify missing critical components (Power supplies, cables, controllers).
        4. Validate against Design Goals.
        
        OUTPUT FORMAT:
        Return a clean Markdown report with emojis for status (✅, ⚠️, ❌). 
        Be extremely critical. If something will smoke/fire, say so.
        `;

        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Using Pro for reasoning
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 2048 }
            }
        });

        return response.text || "Verification inconclusive.";
    } catch (e: any) {
        console.error("Verification failed", e);
        return `Verification failed: ${e.message}`;
    }
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    try {
        const prompt = `
        GENERATE A MANUFACTURING SPECIFICATION BRIEF for a custom custom component.
        
        COMPONENT: ${partName}
        CONTEXT: ${context}
        
        TASK:
        You are a Manufacturing Engineer. Infer the likely physical properties of this custom part based on its context (e.g. if it's a PCB, infer layer count and key ICs. If it's a plate, infer material and finish).
        
        OUTPUT FORMAT:
        Markdown.
        If it's a PCB, format for PCBWay. Include: Dimensions, Layers, Material (FR4), Solder Mask, Silkscreen.
        If it's Mechanical, format for SendCutSend. Include: Material (Alu/Steel/Acrylic), Thickness, Finish, Operations (Tapping, Countersinking).
        
        Be specific and technical.
        `;

        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 2048 }
            }
        });

        return response.text || "Brief generation failed.";
    } catch (e: any) {
        console.error("Fab brief failed", e);
        return `Generation failed: ${e.message}`;
    }
  }
}