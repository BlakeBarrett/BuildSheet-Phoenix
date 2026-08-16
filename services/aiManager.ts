import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { ServerAiService } from './serverAiService.ts';
import { healthApi } from './apiClient.ts';

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

    // API keys are typically much longer than 10 characters
    return cleaned.length > 10;
  }

  /**
   * Safe access to the API Key.
   * Prioritizes Runtime Injection (window._env_) over Build-time (process.env).
   */
  public static getApiKey(): string | undefined {
    let key: any = undefined;

    // 1. Priority: Runtime injection — AI_KEY preferred (provider-agnostic)
    // @ts-ignore
    if (typeof window !== 'undefined' && window._env_ && window._env_.AI_KEY) {
      // @ts-ignore
      const runtimeAiKey = window._env_.AI_KEY;
      if (this.isValidKey(runtimeAiKey)) {
        key = runtimeAiKey;
      }
    }

    // 1b. Runtime injection: API_KEY (legacy fallback)
    // @ts-ignore
    if (!key && typeof window !== 'undefined' && window._env_ && window._env_.API_KEY) {
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

    // 2a. Fallback: process.env.AI_KEY (preferred, provider-agnostic name)
    if (!key) {
      // @ts-ignore
      const aiKey = (typeof process !== 'undefined' && process.env) ? process.env.AI_KEY : undefined;
      if (this.isValidKey(aiKey)) {
        key = aiKey;
      }
    }

    // 2b. Fallback: process.env.GEMINI_API_KEY — legacy, backward compat
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
    // API keys are managed server-side; the browser always considers AI available.
    return true;
  }

  /**
   * Initializes the AI Service.
   * All AI calls are routed through the BuildSheet backend API — no keys in the browser.
   * Falls back to MockService if the server health check fails.
   */
  static async createService(): Promise<{ service: AIService, error?: string }> {
    try {
      const health = await healthApi.check();
      return { service: new ServerAiService(health.service ?? 'BuildSheet AI', health.offline) };
    } catch (err: any) {
      console.warn('AIManager: Server not reachable. Using Mock Service.', err);
      return {
        service: new MockService(),
        error: 'Server not reachable. Using Offline Simulation.',
      };
    }
  }
}