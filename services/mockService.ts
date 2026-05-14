
import { AIService, ArchitectResponse, AskArchitectResult } from './aiTypes.ts';
import { Part, ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, PortType, Gender, AdvancedValidationOption } from '../types.ts';

export class MockService implements AIService {
  public name = "Simulation Engine (Offline)";
  public isOffline = true;

  public getApiKeyStatus(): string {
    return "N/A (Mock Mode)";
  }

  async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
    await new Promise(r => setTimeout(r, 800));
    const lower = prompt.toLowerCase();

    if (image) {
      return { text: `[SIMULATION MODE] Image Analysis...\n\nI see the reference image you uploaded. Based on the visual cues and your request "${prompt}", I am adjusting the draft accordingly.\n\naddPart("inferred-component-from-image", "Inferred Component", "Component", 1)`, metadata: { model: 'simulation-engine' } };
    }

    if (lower.includes('truck') || lower.includes('engine') || lower.includes('chevy')) {
      return { text: `[SIMULATION MODE] Analyzing Heavy Duty Requirements...\n\nBased on the request for a powertrain system, I am initializing a truck configuration.\n\ninitializeDraft("Chevy Truck Config", "Heavy duty application")\naddPart("chevy-ls-v8", "GM 5.3L LS V8 (Aluminum Block)", "Engine", 1)\naddPart("4l60e-transmission", "4L60E Automatic Transmission", "Transmission", 1)`, metadata: { model: 'simulation-engine' } };
    }

    if (lower.includes('gaming') || lower.includes('pc') || lower.includes('computer')) {
      return { text: `[SIMULATION MODE] Analyzing Compute Requirements...\n\nI have drafted a high-performance gaming configuration.\n\ninitializeDraft("Gaming Rig", "High Performance, Liquid Cooled")\naddPart("cpu-flagship", "Flagship Desktop CPU", "Processor", 1)\naddPart("gpu-rtx-4090", "NVIDIA RTX 4090 GPU", "Graphics Card", 1)\naddPart("case-atx-tower", "ATX Full Tower Case", "Case", 1)`, metadata: { model: 'simulation-engine' } };
    }

    if (lower.includes('flashlight') || lower.includes('torch') || lower.includes('led')) {
      return { text: `[SIMULATION MODE] Analyzing Optoelectronics...\n\nI have drafted a handheld LED flashlight using standard components.\n\ninitializeDraft("C8 LED Flashlight", "High-Throw Handheld")\naddPart("c8-aluminum-host", "C8 Aluminum Host", "Chassis", 1)\naddPart("cree-xpl-hi-emitter", "Cree XP-L HI Emitter", "Light Engine", 1)\naddPart("17mm-constant-current-driver", "17mm Constant Current Driver", "Controller", 1)\naddPart("panasonic-18650", "Panasonic 18650 Battery", "Power", 1)`, metadata: { model: 'simulation-engine' } };
    }

    return { text: `[SIMULATION MODE] Analyzing Input Device Requirements...\n\nI have drafted a standard 65% mechanical keyboard layout based on your request.\n\ninitializeDraft("Custom Keyboard", "65% Layout, Linear Switches")\naddPart("65-hotswap-pcb", "65% Hot-swap PCB", "Keyboard PCB", 1)\naddPart("gateron-yellow-switches", "Gateron Milky Yellow Linear Switches", "Switch", 68)\naddPart("tofu65-aluminum-case", "Tofu65 Aluminum Case", "Case", 1)`, metadata: { model: 'simulation-engine' } };
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
      const addMatches = [...text.matchAll(/addPart\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*\)/g)];
      addMatches.forEach(m => {
        toolCalls.push({ type: 'addPart', partId: m[1], name: m[2], category: m[3], qty: parseInt(m[4]) });
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
    // Return a base64 grey square to satisfy the rendering test
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  }



  async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: AdvancedValidationOption[]): Promise<ArchitectResponse> {
    await new Promise(r => setTimeout(r, 2000));

    // Simple check for simulation mode consistency
    const hasBattery = bom.some((b: any) => b.part.category === 'Power');
    const hasLoad = bom.some((b: any) => b.part.category === 'Light Engine' || b.part.category === 'Keyboard PCB');

    let reasoning = "";
    if (hasBattery && hasLoad) {
      reasoning = `## 🛠️ Technical Verification
    
**Status: Pass**

1.  **Power:** ✅ Power source detected and matches load requirements.
2.  **Mechanical:** ✅ Components fit within standard host tolerances.
3.  **Connectivity:** ✅ Logical connections appear valid.

## ⚖️ Patent Risk Analysis

**Risk Level: Low**

*   **Prior Art Check:** The combination of standard off-the-shelf components (Generic Driver, Standard 18650 Cell) constitutes "Obviousness" under 35 U.S.C. § 103.
*   **Freedom to Operate:** No specific proprietary mechanisms detected that would infringe on major active utility patents in this domain.
*   **Advisory:** Ensure the specific "C8 Host" form factor sourced does not violate active design patents (e.g., SureFire or Maglite trade dress).`;
    } else {
      reasoning = `## 🛠️ Technical Verification
    
**Status: Provisional Pass**

1.  **Voltage Check:** ✅ All logic levels appear consistent at 5V.
2.  **Mechanical:** ⚠️ Please verify case depth. Current stack height (PCB + Battery) may exceed enclosure limits by 1.2mm.
3.  **Missing:** ❌ No USB-C Cable detected in BOM. User cannot charge device.

## ⚖️ Patent Risk Analysis

**Risk Level: Moderate**

*   **Potential Conflict:** The proposed wireless charging coil alignment mechanism bears similarity to **US Patent 10,847,998 (Apple Inc.)**.
*   **Recommendation:** Ensure the magnetic alignment array does not replicate the specific polarity arrangement defined in the MagSafe claims.
*   **Action:** Consult IP counsel regarding specific coil winding geometry.`;
    }

    return {
      reasoning,
      toolCalls: [],
      auditActions: hasBattery && hasLoad ? [] : [
        { type: 'addPart' as const, partId: 'usb-c-cable', name: 'USB-C to USB-C Cable (1m)', category: 'Cable', quantity: 1, reason: 'No USB-C Cable detected in BOM. User cannot charge device.' }
      ]
    };
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    await new Promise(r => setTimeout(r, 2000));
    // SVG Placeholder: A blue rectangle with technical lines
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#003366"/><rect x="20" y="20" width="560" height="260" fill="none" stroke="white" stroke-width="2"/><line x1="50" y1="50" x2="550" y2="50" stroke="white" stroke-width="1" stroke-dasharray="5,5"/><line x1="50" y1="250" x2="550" y2="250" stroke="white" stroke-width="1" stroke-dasharray="5,5"/><rect x="150" y="75" width="300" height="150" fill="none" stroke="white" stroke-width="3"/><text x="300" y="150" font-family="monospace" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle">BLUEPRINT: ${partName}</text><text x="300" y="180" font-family="monospace" font-size="14" fill="#88ccff" text-anchor="middle">ORTHOGRAPHIC PROJECTION // SCALE 1:1</text></svg>`;
    const base64 = `data:image/svg+xml;base64,${btoa(svg)}`;

    return `![Blueprint Simulation](${base64})

### 🏭 Manufacturing Specification: ${partName}

**Fabrication Partner:** [PCBWay](https://pcbway.com) (Recommended)

#### Technical Details
*   **Dimensions:** 295mm x 105mm (Estimated based on context)
*   **Material:** High-grade Aluminum / FR4 Composite
*   **Finish:** Matte Black Anodized
*   **Tolerance:** ±0.05mm

#### Critical Notes
1.  **Mounting:** Ensure USB-C connector (J2) is flush with edge cut.
2.  **Routing:** Keep traces away from screw hole mounting points (M2.5) by at least 0.5mm.
3.  **Assembly:** Pick-and-place required for components.`;
  }

  async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol> {
    await new Promise(r => setTimeout(r, 1500));
    return {
      recommendedSensors: ["High-Res RGB Camera (50mm Lens)", "Ring Light Illuminator"],
      inspectionStrategy: "Inspect 100% of units at station 3.",
      defects: [
        { name: "Bent Pins", severity: 'Critical', description: "Any deviation > 5 degrees on connector pins." },
        { name: "Surface Scratches", severity: 'Minor', description: "Visible scratches > 2mm on top face." },
        { name: "Missing Component", severity: 'Critical', description: "Absence of required mounting screws." }
      ]
    };
  }

  // Fixed: Added generatedAt: new Date() to satisfy AssemblyPlan interface requirement
  async generateAssemblyPlan(bom: any[]): Promise<AssemblyPlan | null> {
    await new Promise(r => setTimeout(r, 1500));
    return {
      steps: [
        { stepNumber: 1, description: "Secure base chassis to fixture.", requiredTool: "Vacuum Gripper", estimatedTime: "5s" },
        { stepNumber: 2, description: "Insert main PCB into chassis guides.", requiredTool: "Parallel Gripper", estimatedTime: "12s" },
        { stepNumber: 3, description: "Fasten 4x M2.5 screws.", requiredTool: "Electric Screwdriver", estimatedTime: "20s" }
      ],
      totalTime: "37s",
      difficulty: "Easy",
      requiredEndEffectors: ["Vacuum Gripper", "Parallel Gripper", "Electric Screwdriver"],
      automationFeasibility: 95,
      notes: "Standard pick-and-place operation. High automation potential.",
      generatedAt: new Date()
    };
  }


  async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: import('./aiTypes.ts').AuditAction[], summary: string }> {
    await new Promise(r => setTimeout(r, 1000));
    // Simulate one recommendation based on audit content
    const hasUSB = auditResult.toLowerCase().includes('usb');
    return {
      actions: hasUSB ? [{ type: 'addPart' as const, partId: 'usb-c-cable', name: 'USB-C to USB-C Cable (1m)', category: 'Cable', quantity: 1, reason: 'Missing USB-C cable detected by audit' }] : [],
      summary: hasUSB ? 'Added missing USB-C cable per audit recommendation.' : 'No actionable changes identified from audit.'
    };
  }
}
