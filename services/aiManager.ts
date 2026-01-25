import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { GeminiService } from './geminiService.ts';

export class AIManager {
  
  /**
   * Safe access to the API Key with strict validation.
   * Checks multiple common environment locations and validates format.
   */
  private static getApiKey(): string | undefined {
    let key: string | undefined;

    try {
      // 1. Check standard process.env (Build-time replacement)
      // @ts-ignore
      key = process.env.API_KEY;

      // 2. Check Vite/Modern bundler standards if process.env failed
      if (!key) {
        // @ts-ignore
        key = import.meta.env?.VITE_API_KEY || import.meta.env?.NEXT_PUBLIC_API_KEY;
      }
      
      // 3. Check browser polyfill
      if (!key) {
        key = (window as any).process?.env?.API_KEY;
      }

    } catch (e) {
      console.warn("Error accessing environment variables", e);
    }

    // VALIDATION LOGIC
    if (!key) return undefined;
    
    // Reject common placeholders
    if (key === 'GEMINI_API_KEY' || key.includes('YOUR_API_KEY') || key === 'TODO') {
      console.warn("AIManager: Detected placeholder API Key.");
      return undefined;
    }

    // Reject obviously invalid keys (Google Keys start with AIza and are approx 39 chars)
    if (key.length < 30 || !key.startsWith('AIza')) {
      console.warn("AIManager: API Key format looks invalid (too short or missing prefix).");
      // We return undefined to force fallback, preventing 400 Bad Request errors
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
      console.warn("AIManager: No valid API Key found. Using Mock Service.");
      return { 
        service: new MockService(), 
        error: "Missing or Invalid API Key (Must start with 'AIza'). Using Offline Simulation." 
      };
    }

    try {
      const service = new GeminiService();
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