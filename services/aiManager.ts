import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { GeminiService } from './geminiService.ts';

const INVALID_PLACEHOLDER = 'UNUSED_PLACEHOLDER_FOR_API_KEY';

export class AIManager {
  
  /**
   * Internal helper to validate if a string is a real API key.
   */
  private static isValidKey(key: any): key is string {
    if (!key || typeof key !== 'string') return false;
    
    const cleaned = key.trim().replace(/^['"](.*)['"]$/, '$1');
    
    if (cleaned === '' || 
        cleaned === INVALID_PLACEHOLDER || 
        cleaned === 'undefined' || 
        cleaned === 'null' || 
        cleaned.includes('YOUR_API_KEY') ||
        cleaned === 'TODO') {
      return false;
    }
    
    // Google API Keys are typically much longer than 10 characters
    return cleaned.length > 10;
  }

  /**
   * Safe access to the API Key.
   * Prioritizes Runtime Injection (window._env_) over Build-time (process.env).
   */
  public static getApiKey(): string | undefined {
    let key: any = undefined;

    // 1. Priority: Runtime injection via /env-config.js (Cloud Run standard)
    // @ts-ignore
    if (typeof window !== 'undefined' && window._env_ && window._env_.API_KEY) {
       // @ts-ignore
       const runtimeKey = window._env_.API_KEY;
       if (this.isValidKey(runtimeKey)) {
         key = runtimeKey;
       }
    }

    // 2. Fallback: process.env (Vite define or manual injection)
    if (!key) {
      // @ts-ignore
      const processKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
      if (this.isValidKey(processKey)) {
        key = processKey;
      }
    }

    // 3. Fallback: Vite import.meta.env
    if (!key) {
      // @ts-ignore
      const metaKey = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_API_KEY : undefined;
      if (this.isValidKey(metaKey)) {
        key = metaKey;
      }
    }

    if (!key) return undefined;

    // Final Sanitization: Strip quotes often added by shell scripts
    return key.trim().replace(/^['"](.*)['"]$/, '$1');
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