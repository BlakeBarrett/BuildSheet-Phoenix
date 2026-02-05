
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { HARDWARE_REGISTRY } from "../data/seedData.ts";
import { AIService, ArchitectResponse } from "./aiTypes.ts";
import { ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec } from "../types.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are Gemini, the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 

CORE DIRECTIVE:
You are a FUNCTIONAL AGENT. Your primary job is to Manipulate the State of the drafting board using Tools.
DO NOT just describe the build in text. You MUST call \`initializeDraft\` and \`addPart\` commands to actually create the BOM.

CONTEXT:
You have access to two inventory sources:
1. **Local Registry (Preferred):** Physical parts currently in stock.
2. **Global Catalog (Virtual):** The entire universe of hardware components.

BEHAVIOR:
1. **START:** When a user asks to build something new, you MUST call \`initializeDraft(name, requirements)\` first.
2. **SOURCING:** Invent the specification using Virtual Parts if Local ones don't exist.
3. **OUTPUT FORMAT:** Provide a brief reasoning summary. Append Tool Calls at the end. 
   **CRITICAL:** Do NOT label the tool calls with "Tool Calls:" or "Corrections:". Just output the functions.
   Syntax: \`addPart("id", quantity)\`

TOOLS:
- \`initializeDraft(name: string, requirements: string)\`
- \`addPart(partId: string, quantity: number)\`
- \`removePart(instanceId: string)\`

---
LOCAL REGISTRY (Use these IDs if they match):
${HARDWARE_REGISTRY ? HARDWARE_REGISTRY.map(p => `- ID: "${p.id}" | Name: "${p.name}"`).join('\n') : 'Registry Offline'}
`;

export class GeminiService implements AIService {
  public name = "Gemini 3 Flash";
  public isOffline = false;
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private cleanBase64(dataUrl: string): { mimeType: string, data: string } | null {
    try {
        const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return null;
        return { mimeType: matches[1], data: matches[2] };
    } catch (e) { return null; }
  }

  async askArchitect(prompt: string, history: any[], image?: string): Promise<string> {
    try {
      const contents = [...history];
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
          temperature: 0.7,
          topP: 0.9,
        }
      });

      return response.text || "Gemini provided no output.";
    } catch (error: any) {
      console.error("Gemini SDK Error:", error);
      throw new Error(`Gemini Service Error: ${error.message}`);
    }
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    const toolCalls: any[] = [];
    if (!text) return { reasoning: "Gemini provided no output.", toolCalls };

    let reasoning = text;

    const initMatch = text.match(/initializeDraft\s*\(\s*["'](.+?)["']\s*,\s*["'](.+?)["']\s*\)\s*;?/);
    if (initMatch) {
      toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
      reasoning = reasoning.replace(initMatch[0], '');
    }

    const addMatches = [...text.matchAll(/addPart\s*\(\s*["']?([^"',\s]+)["']?\s*,\s*(\d+)\s*\)\s*;?/g)];
    addMatches.forEach(m => {
        toolCalls.push({ type: 'addPart', partId: m[1], qty: parseInt(m[2]) });
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
        const parts: any[] = [{ text: `Product design concept sketch: ${description}` }];
        if (referenceImage) {
            const imageData = this.cleanBase64(referenceImage);
            if (imageData) parts.unshift({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
        }
        const response: GenerateContentResponse = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts }
        });
        const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        return part ? `data:${part.inlineData!.mimeType || 'image/png'};base64,${part.inlineData!.data}` : null;
    } catch (e) { return null; }
  }

  async findPartSources(query: string): Promise<ShoppingOption[] | null> {
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Find specific purchase options and current pricing for: ${query}. For each item, list the title, store, and price if available.`,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        return chunks
            .filter(chunk => chunk.web)
            .map(chunk => {
                const title = chunk.web?.title || "Sourcing Link";
                // Heuristic: Extract price from title if grounding metadata doesn't provide it explicitly
                const priceMatch = title.match(/\$\d+(\.\d{2})?/);
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

  async findLocalSuppliers(query: string): Promise<LocalSupplier[] | null> {
      try {
          const response = await this.ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `Find local stores for: ${query}.`,
              config: { tools: [{ googleMaps: {} }] }
          });
          const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          return chunks.map(chunk => ({
              name: chunk.maps?.title || chunk.web?.title || "Supplier",
              address: "See Map",
              url: chunk.maps?.uri || chunk.web?.uri
          })).slice(0, 5);
      } catch (e) { return null; }
  }

  async verifyDesign(bom: any[], requirements: string, previousAudit?: string): Promise<ArchitectResponse> {
    try {
        const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} - Price: $${b.part.price} - Description: ${b.part.description}`).join('\n');
        
        let prompt = `
        PERFORM A TECHNICAL AND PATENT AUDIT.
        DESIGN CONTEXT/REQUIREMENTS: ${requirements}
        
        CURRENT BILL OF MATERIALS:
        ${digest}
        `;

        if (previousAudit) {
            prompt += `
            ---
            PREVIOUS AUDIT RESULT:
            ${previousAudit}
            ---
            TASK: The BOM or requirements have changed. Provide a DELTA AUDIT. 
            Identify what has improved or what new risks have been introduced. 
            Keep the response concise by referencing previous findings where still valid.
            `;
        }

        prompt += `
        IMPORTANT: Pay attention to any parts the user mentioned they already own (zero price or explicitly stated in context). 
        Do not recommend alternatives for user-owned hardware unless there is a critical safety or compatibility failure.

        TASK 1: TECHNICAL INTEGRITY (Human-readable report)
        TASK 2: PATENT INFRINGEMENT RISK (Human-readable report)
        TASK 3: CORRECTIONS (Tool Calls)
        
        **CRITICAL INSTRUCTIONS:**
        1. Use Markdown for Task 1 and 2.
        2. **DO NOT** use JSON for Task 3. 
        3. Use ONLY string function format: \`addPart("id", quantity)\` or \`removePart("id")\`.
        4. Place corrections at the absolute end of your response.
        `;

        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: { thinkingConfig: { thinkingBudget: 4096 } }
        });

        return this.parseArchitectResponse(response.text || "");
    } catch (e: any) {
        return { reasoning: `Verification failed: ${e.message}`, toolCalls: [] };
    }
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Manufacturing specs for: ${partName}. Context: ${context}.`,
            config: { thinkingConfig: { thinkingBudget: 2048 } }
        });
        const img = await this.generateProductImage(`Engineering blueprint diagram of ${partName}. Orthographic projections.`);
        return (img ? `![Technical Blueprint](${img})\n\n` : "") + (response.text || "");
    } catch (e: any) { return `Generation failed: ${e.message}`; }
  }

  async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
      try {
          const response = await this.ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `QA protocol for: ${partName}.`,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                          recommendedSensors: { type: Type.ARRAY, items: { type: Type.STRING } },
                          inspectionStrategy: { type: Type.STRING },
                          defects: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, severity: { type: Type.STRING }, description: { type: Type.STRING } } } }
                      }
                  }
              }
          });
          return JSON.parse(response.text || "null");
      } catch (e) { return null; }
  }

  async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
      try {
          const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
          let prompt = `Generate an assembly plan for:\n${bomDigest}`;
          
          if (previousPlan) {
              prompt += `\n\n--- PREVIOUS PLAN: ${JSON.stringify(previousPlan)} ---\nUpdate this plan based on the new BOM. Maintain the same structure.`;
          }

          const response = await this.ai.models.generateContent({
              model: 'gemini-3-pro-preview',
              contents: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                          steps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { stepNumber: { type: Type.INTEGER }, description: { type: Type.STRING }, requiredTool: { type: Type.STRING }, estimatedTime: { type: Type.STRING } } } },
                          totalTime: { type: Type.STRING },
                          difficulty: { type: Type.STRING },
                          requiredEndEffectors: { type: Type.ARRAY, items: { type: Type.STRING } },
                          automationFeasibility: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                      }
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
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Generate a 3D printable enclosure specification for this project. Context: ${context}. Components: ${bomDigest}`,
            config: {
                thinkingConfig: { thinkingBudget: 4096 },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        material: { type: Type.STRING },
                        dimensions: { type: Type.STRING },
                        openSCAD: { type: Type.STRING, description: "OpenSCAD script code for the enclosure" },
                        description: { type: Type.STRING }
                    }
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
        const step = plan.steps.find(s => s.stepNumber === currentStep);
        const imageData = this.cleanBase64(image);
        if (!imageData) return "Unable to process camera frame.";

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            contents: {
                parts: [
                    { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
                    { text: `AR ASSEMBLY GUIDE: Current Step ${currentStep}: ${step?.description}. REQUIRED TOOL: ${step?.requiredTool}. 
                    Analyze the camera frame. Are the correct parts visible? Are they oriented correctly? 
                    Provide a concise instruction for the user. Keep it under 30 words.` }
                ]
            }
        });
        return response.text || "Continue with the assembly step.";
    } catch (e) { return "Guidance temporarily unavailable."; }
  }
}
