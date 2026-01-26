import { AIService, ArchitectResponse } from './aiTypes.ts';

export class MockService implements AIService {
  public name = "Simulation Engine (Offline)";
  public isOffline = true;

  async askArchitect(prompt: string, history: any[], image?: string): Promise<string> {
    await new Promise(r => setTimeout(r, 800));
    const lower = prompt.toLowerCase();
    
    if (image) {
        return `[SIMULATION MODE] Image Analysis...\n\nI see the reference image you uploaded. Based on the visual cues and your request "${prompt}", I am adjusting the draft accordingly.\n\naddPart("inferred-component-from-image", 1)`;
    }

    if (lower.includes('truck') || lower.includes('engine') || lower.includes('chevy')) {
        return `[SIMULATION MODE] Analyzing Heavy Duty Requirements...\n\nBased on the request for a powertrain system, I am initializing a truck configuration.\n\ninitializeDraft("Chevy Truck Config", "Heavy duty application")\naddPart("truck-eng-1", 1)\naddPart("truck-trans-1", 1)`;
    }

    if (lower.includes('gaming') || lower.includes('pc') || lower.includes('computer')) {
         return `[SIMULATION MODE] Analyzing Compute Requirements...\n\nI have drafted a high-performance gaming configuration.\n\ninitializeDraft("Gaming Rig", "High Performance, Liquid Cooled")\naddPart("cpu-flagship", 1)\naddPart("gpu-rtx-4090", 1)\naddPart("case-atx-tower", 1)`;
    }

    if (lower.includes('flashlight') || lower.includes('torch') || lower.includes('led')) {
         return `[SIMULATION MODE] Analyzing Optoelectronics...\n\nI have drafted a handheld LED flashlight using standard components found in the registry.\n\ninitializeDraft("C8 LED Flashlight", "High-Throw Handheld")\naddPart("flashlight-body", 1)\naddPart("led-emitter", 1)\naddPart("led-driver-ic", 1)\naddPart("batt-18650", 1)`;
    }
    
    return `[SIMULATION MODE] Analyzing Input Device Requirements...\n\nI have drafted a standard 65% mechanical keyboard layout based on your request.\n\ninitializeDraft("Custom Keyboard", "65% Layout, Linear Switches")\naddPart("kb-pcb-1", 1)\naddPart("kb-sw-1", 68)\naddPart("kb-case-1", 1)`;
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
    
    // Parse addPart and removePart using matchAll
    try {
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
    } catch (e) { console.error("Regex parsing error", e); }

    // Cleanup whitespace artifacts
    reasoning = reasoning.replace(/[ \t]+$/gm, '');
    reasoning = reasoning.replace(/\n{3,}/g, '\n\n');

    return { reasoning: reasoning.trim(), toolCalls };
  }

  async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 1000));
    return null;
  }

  async findPartSources(query: string): Promise<any> {
      await new Promise(r => setTimeout(r, 1000));
      return {
          options: [
              { title: "Mouser Electronics", url: "https://www.mouser.com", source: "mouser.com" },
              { title: "DigiKey", url: "https://www.digikey.com", source: "digikey.com" },
              { title: "Adafruit", url: "https://www.adafruit.com", source: "adafruit.com" }
          ]
      };
  }

  async verifyDesign(bom: any[], requirements: string): Promise<string> {
    await new Promise(r => setTimeout(r, 2000));
    
    // Simple check for simulation mode consistency
    const hasBattery = bom.some(b => b.part.category === 'Power');
    const hasLoad = bom.some(b => b.part.category === 'Light Engine' || b.part.category === 'Keyboard PCB');
    
    if (hasBattery && hasLoad) {
         return `### ✅ Simulation Audit Report
    
**Status: Pass**

1.  **Power:** ✅ Power source detected and matches load requirements.
2.  **Mechanical:** ✅ Components fit within standard host tolerances.
3.  **Connectivity:** ✅ Logical connections appear valid.

*System looks good for prototyping.*`;
    }

    return `### ⚠️ Simulation Audit Report
    
**Status: Provisional Pass**

1.  **Voltage Check:** ✅ All logic levels appear consistent at 5V.
2.  **Mechanical:** ⚠️ Please verify case depth. Current stack height (PCB + Battery) may exceed enclosure limits by 1.2mm.
3.  **Missing:** ❌ No USB-C Cable detected in BOM. User cannot charge device.

*Recommendation: Add a standard USB-C cable and check z-height constraints.*`;
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    await new Promise(r => setTimeout(r, 2000));
    return `### 🏭 Manufacturing Specification: ${partName}

**Fabrication Partner:** [PCBWay](https://pcbway.com) (Recommended)

#### Technical Details
*   **Dimensions:** 295mm x 105mm (Estimated for 65% Layout)
*   **Layers:** 2-Layer FR4
*   **Thickness:** 1.6mm
*   **Copper Weight:** 1oz
*   **Surface Finish:** ENIG (Electroless Nickel Immersion Gold) - Recommended for hot-swap sockets.
*   **Solder Mask:** Matte Black
*   **Silkscreen:** White

#### Critical Notes
1.  **Mounting:** Ensure USB-C connector (J2) is flush with edge cut.
2.  **Routing:** Keep traces away from screw hole mounting points (M2.5) by at least 0.5mm.
3.  **Assembly:** Pick-and-place required for Kailh Hot-swap sockets.`;
  }
}