
import { GoogleGenAI, Type } from "@google/genai";
import { HARDWARE_REGISTRY } from "../data/seedData";
import { VisualManifest } from "../types";

const SYSTEM_INSTRUCTION = `
ROLE: You are the Senior Hardware Architect at BuildSheet. You design complex systems and visualize physical stack-ups.

CORE BEHAVIOR:
1. DESIGN-FIRST: Architect functional systems. "Yes, and..." philosophy.
2. HANDLING MISSING DATA: If parts aren't in registry, infer requirements and use addPart("generic-id", 1).
3. PHYSICAL REASONING: Describe exactly how parts mate (e.g., JST-PH 2.0 connectors).
4. VISUAL MANIFEST: You MUST provide a 3D Spatial Manifest for the "Chilton Visualizer" whenever the build changes.
5. NO FILLER, NO CODE: Start with analysis. Never use markdown code blocks.

VISUAL MANIFEST RULES:
Include a section starting with "VISUALIZATION:" followed by a JSON object.
- stackAxis: "x", "y", or "z" (direction of stack-up).
- components: Array of { partId, shape ("box", "cylinder", "sphere"), dims [w, h, d], color (hex), label }.
- Dimension units are relative mm.

TOOLS:
- initializeDraft(name: string, requirements: string)
- addPart(partId: string, quantity: number)
- removePart(instanceId: string)

REGISTRY CONTEXT:
${HARDWARE_REGISTRY.map(p => {
  const ports = p.ports.map(pt => `${pt.name} (${pt.gender} ${pt.spec})`).join(', ');
  return `- ${p.id}: ${p.name} [Category: ${p.category}] | Ports: ${ports}`;
}).join('\n')}

EXAMPLE OUTPUT:
The system requires a battery stacked beneath the main PCB.
addPart("generic-battery", 1)
addPart("main-pcb", 1)
VISUALIZATION: {
  "stackAxis": "z",
  "components": [
    { "partId": "generic-battery", "shape": "box", "dims": [40, 30, 5], "color": "#A0AEC0", "label": "LiPo Battery" },
    { "partId": "main-pcb", "shape": "box", "dims": [50, 50, 2], "color": "#4A5568", "label": "Controller PCB" }
  ]
}
`;

export async function askArchitect(prompt: string, history: { role: 'user' | 'model', parts: any[] }[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [
        ...history.map(h => ({ role: h.role, parts: h.parts })),
        { role: 'user', parts: [{ text: prompt }] }
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      topP: 0.8,
    },
  });

  return response.text;
}

export function parseArchitectResponse(text: string): { reasoning: string, toolCalls: any[], visualization?: VisualManifest } {
  const toolCalls: any[] = [];
  let visualization: VisualManifest | undefined;
  
  // Extract Visualization JSON
  const vizIndex = text.indexOf("VISUALIZATION:");
  let reasoning = text;
  
  if (vizIndex !== -1) {
    const vizString = text.substring(vizIndex + 14).trim();
    reasoning = text.substring(0, vizIndex).trim();
    try {
      // Find the end of the JSON object
      let depth = 0;
      let endIdx = -1;
      for (let i = 0; i < vizString.length; i++) {
        if (vizString[i] === '{') depth++;
        if (vizString[i] === '}') {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
      if (endIdx !== -1) {
        visualization = JSON.parse(vizString.substring(0, endIdx));
      }
    } catch (e) {
      console.warn("Failed to parse visual manifest", e);
    }
  }

  const initMatch = text.match(/initializeDraft\s*\(\s*['"](.+?)['"]\s*,\s*['"](.+?)['"]\s*\)/);
  if (initMatch) {
    toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
    reasoning = reasoning.replace(initMatch[0], '');
  }

  const addMatches = [...text.matchAll(/addPart\s*\(\s*['"](.+?)['"]\s*,\s*(\d+)\s*\)/g)];
  addMatches.forEach(m => {
    toolCalls.push({ type: 'addPart', partId: m[1], qty: parseInt(m[2]) });
    reasoning = reasoning.replace(m[0], '');
  });

  const removeMatches = [...text.matchAll(/removePart\s*\(\s*['"](.+?)['"]\s*\)/g)];
  removeMatches.forEach(m => {
    toolCalls.push({ type: 'removePart', instanceId: m[1] });
    reasoning = reasoning.replace(m[0], '');
  });

  return { reasoning: reasoning.trim(), toolCalls, visualization };
}
