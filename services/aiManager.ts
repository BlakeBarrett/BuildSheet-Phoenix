import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { GeminiService } from './geminiService.ts';

export class AIManager {
  
  /**
   * Safe access to the API Key.
   * Strictly uses process.env.API_KEY as the source of truth per application guidelines.
   * Cleans potential artifacts like whitespace or surrounding quotes.
   */
  public static getApiKey(): string | undefined {
    // Attempt to access process.env.API_KEY directly.
    // In many "applet" environments, this is injected globally.
    // @ts-ignore
    let key = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;

    if (!key) return undefined;

    // Clean potential quotes and whitespace from env injection
    if (typeof key === 'string') {
      key = key.trim().replace(/^['"](.*)['"]$/, '$1');
    }

    // Filter out obvious empty/placeholder values
    if (!key || key === '' || key === 'TODO' || key === 'YOUR_API_KEY' || key.includes('YOUR_API_KEY')) {
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
      // We pass the key, but GeminiService will also re-fetch from process.env 
      // per call to ensure maximum reliability.
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