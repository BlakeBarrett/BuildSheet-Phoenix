
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

    // Check for runtime injection (common in Cloud Run / Docker setups)
    // @ts-ignore
    if (!key && typeof window !== 'undefined' && window._env_ && window._env_.API_KEY) {
       // @ts-ignore
       key = window._env_.API_KEY;
    }

    if (!key) return undefined;

    // Clean potential quotes and whitespace from env injection
    if (typeof key === 'string') {
      key = key.trim().replace(/^['"](.*)['"]$/, '$1');
    }

    // Filter out obvious empty/placeholder values
    const invalidKeys = [
        '', 
        'TODO', 
        'YOUR_API_KEY', 
        'UNUSED_PLACEHOLDER_FOR_API_KEY'
    ];

    if (invalidKeys.includes(key) || key.includes('YOUR_API_KEY')) {
      return undefined;
    }

    // Google API Keys typically start with "AIza"
    if (!key.startsWith('AIza')) {
        console.warn(`[AIManager] Detected potential API Key issue. Key does not start with 'AIza'. Value: ${key.substring(0, 5)}...`);
        // We strictly reject the placeholder, but for other non-standard keys we might warn but allow, 
        // however, the placeholder 'UNUSED_PLACEHOLDER_FOR_API_KEY' is definitely invalid.
        if (key === 'UNUSED_PLACEHOLDER_FOR_API_KEY') return undefined;
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
