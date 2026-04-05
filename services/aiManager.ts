import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { HybridAIService } from './hybridAiService.ts';
import { LocalModelProvider } from './localAiService.ts';

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

    // 2b. Fallback: process.env.GEMINI_API_KEY
    if (!key) {
      // @ts-ignore
      const geminiKey = (typeof process !== 'undefined' && process.env) ? process.env.GEMINI_API_KEY : undefined;
      if (this.isValidKey(geminiKey)) {
        key = geminiKey;
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
   * Safe access to the Search/Grounding API Key.
   * Allows customers to use a separate key for search operations (Google Search,
   * Google Maps, part hydration). Falls back to the main API key if not set.
   *
   * This abstraction exists so that Enterprise customers can:
   *   1. Use their own Gemini API key for grounding, separate from generation
   *   2. Eventually swap to VertexAI Products API with a different credential
   */
  public static getSearchApiKey(): string | undefined {
    let key: any = undefined;

    // 1. Runtime injection via env-config.js
    // @ts-ignore
    if (typeof window !== 'undefined' && window._env_ && window._env_.SEARCH_API_KEY) {
      // @ts-ignore
      const runtimeKey = window._env_.SEARCH_API_KEY;
      if (this.isValidKey(runtimeKey)) key = runtimeKey;
    }

    // 2. process.env
    if (!key) {
      // @ts-ignore
      const processKey = (typeof process !== 'undefined' && process.env) ? process.env.SEARCH_API_KEY : undefined;
      if (this.isValidKey(processKey)) key = processKey;
    }

    // 3. localStorage override (set via Settings Modal)
    if (!key) {
      try {
        const saved = localStorage.getItem('searchApiKey');
        if (saved && this.isValidKey(saved)) key = saved;
      } catch { /* noop */ }
    }

    // 4. Fall back to the main API key
    if (!key) return this.getApiKey();

    return key.trim().replace(/^['"](.*)['"]$/, '$1');
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
      const service = new HybridAIService(apiKey);
      
      // 1. Env vars take precedence as default if local storage doesn't override it
      // @ts-ignore
      let envUrl = (typeof window !== 'undefined' && window._env_ && window._env_.LOCAL_ARCHITECT_URL) || (typeof process !== 'undefined' && process.env && process.env.LOCAL_ARCHITECT_URL);
      // @ts-ignore
      let envModel = (typeof window !== 'undefined' && window._env_ && window._env_.LOCAL_ARCHITECT_MODEL) || (typeof process !== 'undefined' && process.env && process.env.LOCAL_ARCHITECT_MODEL);
      
      let localProvider: LocalModelProvider | undefined = undefined;

      try {
        const savedProviderHtml = localStorage.getItem('localArchitectProvider');
        if (savedProviderHtml) {
          localProvider = JSON.parse(savedProviderHtml);
        }
      } catch (e) {
        console.warn("Could not load local provider from localStorage", e);
      }
      
      if (!localProvider && envUrl && envModel) {
          localProvider = {
              id: envModel as string,
              name: `[Env Config] ${envModel}`,
              endpointUrl: envUrl as string,
              type: 'openai'
          } as LocalModelProvider;
      }

      if (localProvider) {
          service.setLocalArchitect(localProvider);
      }

      return { service };
    } catch (error: any) {
      console.error("AIManager: Failed to instantiate HybridAIService.", error);
      return {
        service: new MockService(),
        error: `Service Initialization Failed: ${error.message}`
      };
    }
  }
}