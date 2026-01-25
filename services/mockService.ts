

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
}