import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { HARDWARE_REGISTRY } from "../data/seedData.ts";
import { AIService, ArchitectResponse } from "./aiTypes.ts";
import { ShoppingOption, LocalSupplier, InspectionProtocol } from "../types.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are Gemini, the Senior Hardware Architect at BuildSheet. You design complex systems using the available Parts Registry.

CORE BEHAVIOR:
1. DESIGN-FIRST: Architect functional systems. "Yes, and..." philosophy.
2. CLARIFICATION PROTOCOL: 
   - If a request is highly ambiguous (e.g., "Build a PC", "Make a robot"), DO NOT guess. Ask 1-3 short, technical questions to define the scope (e.g., "Use case: Gaming or Workstation?", "Form factor preferences?").
   - If the request has sufficient detail, PROCEED immediately to tool execution.
3. HANDLING MISSING DATA: If parts aren't in registry, you MAY infer requirements using addPart("generic-id", qty), but PREFER existing parts.
4. COMPATIBILITY ENFORCEMENT: 
   - You MUST check the 'Ports' definition of parts in the Registry.
   - ONLY connect parts if they have compatible ports (e.g., MALE 'mx-socket' <-> FEMALE 'mx-socket').
   - DO NOT propose a BOM that is physically impossible (e.g., 2 male connectors).
5. MULTIMODAL ANALYSIS: If the user provides an image, analyze it for mechanical constraints, aesthetic style, or existing component identification.
6. NO FILLER, NO CODE: Start with analysis. Never use markdown code blocks.

TOOLS:
- initializeDraft(name: string, requirements: string)
- addPart(partId: string, quantity: number)
- removePart(instanceId: string)

REGISTRY CONTEXT:
${HARDWARE_REGISTRY ? HARDWARE_REGISTRY.map(p => {
  const ports = p.ports.map(pt => `${pt.name} (${pt.gender} ${pt.spec})`).join(', ');
  return `- ${p.id}: ${p.name} [Category: ${p.category}] | Ports: ${ports}`;
}).join('\n') : 'Registry Offline'}

EXAMPLE 1 (Ambiguous Request):
User: "I want to build a computer."
Reasoning: The request lacks critical details regarding performance targets and form factor.
Response: What is the primary workload for this computer (e.g., 4K Video Editing, High-Refresh Gaming, Home Server)? Do you have a specific size constraint (ATX, ITX)?

EXAMPLE 2 (Actionable Request):
User: "I need a gaming keyboard."
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
    if (!text) return { reasoning: "Gemini provided no output.", toolCalls };

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

  private async generateImage(prompt: string, referenceImage?: string): Promise<string | null> {
    try {
        const parts: any[] = [{ text: prompt }];

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

  async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
    return this.generateImage(`Generate a high-quality product design concept sketch for: ${description}`, referenceImage);
  }

  async findPartSources(query: string): Promise<ShoppingOption[] | null> {
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Find purchase options for: ${query}. Return structured JSON with price, merchant, and url.`,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            url: { type: Type.STRING },
                            source: { type: Type.STRING, description: "Name of the merchant" },
                            price: { type: Type.STRING, description: "Price including currency symbol" }
                        }
                    }
                }
            }
        });

        const json = JSON.parse(response.text || "[]");
        return json.map((item: any) => ({
            title: item.title,
            url: item.url,
            source: item.source,
            price: item.price
        }));
    } catch (e) {
        console.error("Sourcing lookup failed", e);
        return null;
    }
  }

  async findLocalSuppliers(query: string, location?: { lat: number, lng: number }): Promise<LocalSupplier[] | null> {
      try {
          const prompt = `Find local electronics or hardware stores that might sell: ${query}. Focus on physical retail locations.`;
          
          const response = await this.ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: {
                  tools: [{ googleMaps: {} }],
                  // Retrieve lat/lng if provided, otherwise defaults to IP-based
                  toolConfig: location ? {
                      retrievalConfig: {
                          latLng: {
                              latitude: location.lat,
                              longitude: location.lng
                          }
                      }
                  } : undefined
              }
          });

          // Maps Grounding data isn't in JSON responseSchema, it's in candidates.groundingMetadata
          const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
          
          if (!chunks || chunks.length === 0) return null;

          // Process Grounding Chunks into LocalSupplier format
          // Note: The structure of Maps groundingChunks can vary, we look for place Answer Sources or simple web extraction if fallback
          const suppliers: LocalSupplier[] = [];

          chunks.forEach(chunk => {
              if (chunk.maps?.title && chunk.maps?.placeId) {
                  // Currently Maps grounding returns a title and place ID primarily in the grounding chunk wrapper
                  // We often need to parse the text or use the metadata
                  // For this demo, we assume the text contains useful info or we construct from what we have
                  suppliers.push({
                      name: chunk.maps.title,
                      address: "See Map", // Grounding often returns address in snippets, simplified here
                      url: chunk.maps.uri || `https://www.google.com/maps/place/?q=place_id:${chunk.maps.placeId}`
                  });
              } else if (chunk.web && chunk.web.uri && chunk.web.title) {
                  // Fallback to web results if specific Maps objects aren't clean
                  if (chunk.web.title.toLowerCase().includes('store') || chunk.web.title.toLowerCase().includes('supply')) {
                      suppliers.push({
                          name: chunk.web.title,
                          address: "Online / Unknown",
                          url: chunk.web.uri
                      });
                  }
              }
          });

          return suppliers.slice(0, 5); // Limit to top 5
      } catch (e) {
          console.error("Local map lookup failed", e);
          return null;
      }
  }

  async verifyDesign(bom: any[], requirements: string): Promise<ArchitectResponse> {
    try {
        // Includes instanceId to allow specific removal commands
        const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.sku}) - Ports: ${JSON.stringify(b.part.ports)}`).join('\n');
        
        const prompt = `
        PERFORM A DEEP TECHNICAL AUDIT ON THIS HARDWARE SYSTEM.
        
        DESIGN GOALS: ${requirements}
        
        BILL OF MATERIALS:
        ${digest}
        
        TASK:
        1. Identify voltage mismatches, connector mismatches, or missing parts.
        2. AUTO-CORRECT: If you find incompatible parts, you MUST output \`removePart("instance_id")\` AND \`addPart("correct_part_id", qty)\`.
        3. BE AGGRESSIVE: Do not just delete incompatible parts. You MUST suggest a valid replacement from your internal knowledge of standard hardware (e.g., if a battery is wrong, add the correct one).
        
        OUTPUT FORMAT:
        Provide a Markdown report (Action Taken, Status) followed by any necessary tool calls.
        `;

        const response = await this.ai.models.generateContent({
            model: 'gemini-3-pro-preview', // Using Pro for reasoning
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 2048 }
            }
        });

        // Use the same parser as chat to extract tool calls from the verification report
        return this.parseArchitectResponse(response.text || "");
    } catch (e: any) {
        console.error("Verification failed", e);
        return { 
          reasoning: `Verification failed: ${e.message}`, 
          toolCalls: [] 
        };
    }
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    try {
        const textPrompt = `
        GENERATE A MANUFACTURING SPECIFICATION BRIEF for a custom custom component.
        
        COMPONENT: ${partName}
        CONTEXT: ${context}
        
        TASK:
        You are a Manufacturing Engineer. Infer the likely physical properties of this custom part based on its context.
        
        OUTPUT FORMAT:
        Markdown. Be specific and technical.
        `;

        const textPromise = this.ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: textPrompt,
            config: {
                thinkingConfig: { thinkingBudget: 2048 }
            }
        });

        const imagePrompt = `Technical engineering blueprint diagram of ${partName}. Context: ${context}. Classic blueprint style: white lines on dark blue paper background. Orthographic projection with dimension lines.`;
        const imagePromise = this.generateImage(imagePrompt);

        const [textResponse, base64Image] = await Promise.all([textPromise, imagePromise]);

        let markdown = textResponse.text || "Brief generation failed.";
        
        if (base64Image) {
            markdown = `![Technical Blueprint](${base64Image})\n\n` + markdown;
        }

        return markdown;
    } catch (e: any) {
        console.error("Fab brief failed", e);
        return `Generation failed: ${e.message}`;
    }
  }

  async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
      try {
          const prompt = `
          You are a Manufacturing Quality Engineer using Google's Manufacturing Data Engine (MDE).
          
          TASK: Create a Visual Inspection AI Protocol for: ${partName} (Category: ${category}).
          
          REQUIREMENTS:
          1. Identify 3-5 specific cosmetic or functional defects (e.g. scratches, bent pins, voiding).
          2. Assign severity (Critical, Major, Minor).
          3. Recommend camera/sensor setup for the inspection station.
          
          RETURN JSON ONLY.
          `;

          const response = await this.ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                          recommendedSensors: {
                              type: Type.ARRAY,
                              items: { type: Type.STRING }
                          },
                          inspectionStrategy: { type: Type.STRING },
                          defects: {
                              type: Type.ARRAY,
                              items: {
                                  type: Type.OBJECT,
                                  properties: {
                                      name: { type: Type.STRING },
                                      severity: { type: Type.STRING, enum: ['Critical', 'Major', 'Minor'] },
                                      description: { type: Type.STRING }
                                  }
                              }
                          }
                      }
                  }
              }
          });

          return JSON.parse(response.text || "null");
      } catch (e) {
          console.error("QA Protocol generation failed", e);
          return null;
      }
  }
}
