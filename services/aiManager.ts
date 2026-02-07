import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { GeminiService } from './geminiService.ts';

export class AIManager {
  
  /**
   * Safe access to the API Key.
   * Strictly uses process.env.API_KEY as the source of truth per application guidelines.
   */
  public static getApiKey(): string | undefined {
    // @ts-ignore
    const key = process.env.API_KEY;

    // Filter out obvious empty/placeholder values
    if (!key || key === 'TODO' || key.includes('YOUR_API_KEY')) {
      return undefined;
    }

    return key;
  }

  static hasApiKey(): boolean {
    return !!this.getApiKey();
  }

  /**
   * Initializes the AI Service.
   * Uses GeminiService (REST) if API key is valid, otherwise falls back to MockService.
   */
  static async createService(): Promise<{ service: AIService, error?: string }> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      console.warn("AIManager: No API Key found in process.env.API_KEY. Using Mock Service.");
      return { 
        service: new MockService(), 
        error: "Missing API Key. Using Offline Simulation." 
      };
    }

    try {
      const service = new GeminiService(apiKey);
      return { service };
    } catch (error: any) {
      console.error("AIManager: Failed to instantiate GeminiService.", error);
      return { 
        service: new MockService(), 
        error: `Service Initialization Failed: ${error.message}` 
      };
    }
  }
}