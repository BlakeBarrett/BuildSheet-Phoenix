import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { HARDWARE_REGISTRY } from "../data/seedData.ts";
import { AIService, ArchitectResponse } from "./aiTypes.ts";
import { ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan } from "../types.ts";

const SYSTEM_INSTRUCTION = `
ROLE: You are Gemini, the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 

CORE DIRECTIVE:
You are a FUNCTIONAL AGENT. Your primary job is to Manipulate the State of the drafting board using Tools.
DO NOT just describe the build in text. You MUST call \`initializeDraft\` and \`addPart\` commands to actually create the BOM.

CONTEXT:
You have access to two inventory sources:
1. **Local Registry (Preferred):** Physical parts currently in stock.
2. **Global Catalog (Virtual):** The entire universe of hardware components.

ROBOTICS & PHYSICS KNOWLEDGE:
- You inherently understand kinematic chains, payload limits, and assembly feasibility.
- When creating Virtual Parts, consider their weight and manipulability.
- If a user asks for a "Drone", ensure you select motors with sufficient thrust-to-weight ratio.
- If a user asks for a "Robot Arm", ensure servos have sufficient torque.

BEHAVIOR:
1. **START:** When a user asks to build something new, you MUST call \`initializeDraft(name, requirements)\` first.

2. **SOURCING & VIRTUAL PART CREATION:** 
   - Check the **Local Registry** first. If a part fits the user's needs perfectly, use it.
   - If the Local Registry is insufficient or irrelevant (e.g., user wants a "Gaming PC" but registry only has "Truck Parts"), you **MUST** ignore the registry and architect the system using **Virtual Parts**.
   - To add a part from the Global Catalog, simply generate a new \`partId\` that describes the item.
   - **ID Convention:** Use kebab-case that is descriptive. 
     - BAD: \`part-1\`, \`gpu\`, \`thing\`
     - GOOD: \`gpu-nvidia-rtx4090\`, \`mcu-esp32-wroom\`, \`servo-mg996r-metal\`
   - The system will automatically create a placeholder for these IDs.
   - **NEVER** say "I can't find parts". You are an Architect; invent the specification using Virtual Parts.

3. **COMPATIBILITY:** 
   - For Local Registry parts, respect the declared 'Ports'.
   - For Virtual Parts, assume standard industry interfaces (e.g., PCIe, USB, GPIO) apply implicitly.

4. **CLARIFICATION:**
   - If the request is vague ("Build a thing"), ask clarifying questions.
   - If specific ("Build a drone"), immediately generate the BOM using Virtual Parts if Local ones don't exist.

5. **OUTPUT FORMAT:**
   - You can provide a brief reasoning summary.
   - You **MUST** append the Tool Calls at the end or embedded in your response.
   - Syntax: \`addPart("id", quantity)\`

TOOLS:
- \`initializeDraft(name: string, requirements: string)\`
- \`addPart(partId: string, quantity: number)\`
- \`removePart(instanceId: string)\`

---
LOCAL REGISTRY (Use these IDs if they match):
${HARDWARE_REGISTRY ? HARDWARE_REGISTRY.map(p => {
  const ports = p.ports.map(pt => `${pt.name} (${pt.gender} ${pt.spec})`).join(', ');
  return `- ID: "${p.id}" | Name: "${p.name}" | Cat: "${p.category}"`;
}).join('\n') : 'Registry Offline'}
---

EXAMPLE 1 (Using Virtual Parts):
User: "Design a Raspberry Pi home server."
Reasoning: Local registry has no Raspberry Pi. I will use Virtual Parts from the Global Catalog.
Tool Calls:
initializeDraft("Home Media Server", "RPi 4 based, low power")
addPart("sbc-rpi-4-8gb", 1)
addPart("case-flirc-alu", 1)
addPart("psu-usb-c-5v-3a", 1)
addPart("ssd-samsung-t7-1tb", 1)

EXAMPLE 2 (Hybrid):
User: "I need a flashlight."
Reasoning: Local registry contains "flashlight-body", "led-emitter", etc. I will use those.
Tool Calls:
initializeDraft("C8 LED Torch", "High lumens")
addPart("flashlight-body", 1)
addPart("led-emitter", 1)
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
          temperature: 0.7, // Increased to allow creative Virtual Part generation
          topP: 0.9,
        }
      });

      // Robust error handling for empty responses
      if (!response.text) {
          if (response.candidates && response.candidates.length > 0) {
              const candidate = response.candidates[0];
              if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                  return `Error: Model stopped due to ${candidate.finishReason}. Please try rephrasing.`;
              }
          }
          return "Gemini provided no output.";
      }

      return response.text;
    } catch (error: any) {
      console.error("Gemini SDK Error:", error);
      throw new Error(`Gemini Service Error: ${error.message}`);
    }
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    const toolCalls: any[] = [];
    if (!text) return { reasoning: "Gemini provided no output.", toolCalls };

    let reasoning = text;

    // Parse initializeDraft - Robust Regex with optional semicolon
    const initMatch = text.match(/initializeDraft\s*\(\s*["'](.+?)["']\s*,\s*["'](.+?)["']\s*\)\s*;?/);
    if (initMatch) {
      toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
      reasoning = reasoning.replace(initMatch[0], '');
    }

    try {
      // Parse addPart - More flexible quotes/spacing, optional semicolon
      const addMatches = [...text.matchAll(/addPart\s*\(\s*["']?([^"',\s]+)["']?\s*,\s*(\d+)\s*\)\s*;?/g)];
      addMatches.forEach(m => {
          toolCalls.push({ type: 'addPart', partId: m[1], qty: parseInt(m[2]) });
          reasoning = reasoning.replace(m[0], '');
      });

      // Parse removePart - Optional semicolon
      const removeMatches = [...text.matchAll(/removePart\s*\(\s*["']?([^"',\s]+)["']?\s*\)\s*;?/g)];
      removeMatches.forEach(m => {
          toolCalls.push({ type: 'removePart', instanceId: m[1] });
          reasoning = reasoning.replace(m[0], '');
      });
    } catch (e) {
        console.error("Parsing Regex Error", e);
    }

    // Cleanup whitespace artifacts from removed tool calls
    // Remove lines that are now just comments (leftovers from removed code lines)
    reasoning = reasoning.replace(/^\s*\/\/.*$/gm, '');
    // Remove lines that are just semicolons or empty
    reasoning = reasoning.replace(/^\s*;\s*$/gm, '');
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
                // Ensure mimeType is present, fallback to png if missing
                const mime = part.inlineData.mimeType || 'image/png';
                return `data:${mime};base64,${part.inlineData.data}`;
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
        3. BE AGGRESSIVE: Do not just delete incompatible parts. You MUST suggest a valid replacement from your internal knowledge OR the Global Catalog.
        
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

  async generateAssemblyPlan(bom: any[]): Promise<AssemblyPlan | null> {
      try {
          const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name} (${b.part.category})`).join('\n');
          
          const prompt = `
          ROLE: You are "Gemini Robotics-ER 1.5", an expert in Robotics and Manufacturing Engineering.
          
          TASK: Create a Robotic Automated Assembly Plan for the following Bill of Materials.
          
          BOM:
          ${bomDigest}
          
          REQUIREMENTS:
          1. Analyze the parts for potential collision points or difficult manipulations.
          2. Determine the End-Effector (Gripper) types required (e.g. Vacuum, 2-Finger, Magnetic).
          3. Generate a step-by-step assembly sequence for a 6-DOF Industrial Robot Arm.
          4. Estimate the difficulty and automation feasibility (0-100%).
          
          RETURN JSON ONLY.
          `;

          const response = await this.ai.models.generateContent({
              model: 'gemini-3-pro-preview',
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
                                  }
                              }
                          },
                          totalTime: { type: Type.STRING },
                          difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard', 'Expert'] },
                          requiredEndEffectors: { type: Type.ARRAY, items: { type: Type.STRING } },
                          automationFeasibility: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                      }
                  }
              }
          });

          return JSON.parse(response.text || "null");
      } catch (e) {
          console.error("Assembly Plan generation failed", e);
          return null;
      }
  }
}