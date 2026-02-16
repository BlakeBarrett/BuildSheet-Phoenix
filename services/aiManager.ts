import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';
import { GeminiService } from './geminiService.ts';
import { LocalAIService, LocalAIConfig } from './localAIService.ts';

const INVALID_PLACEHOLDER = 'UNUSED_PLACEHOLDER_FOR_API_KEY';

export type AIProvider = 'gemini' | 'ollama' | 'local';

export interface AIConfiguration {
  provider: AIProvider;
  geminiApiKey?: string;
  localConfig?: LocalAIConfig;
}

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
   * Safe access to the Gemini API Key.
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

  /**
   * Get the AI provider configuration from environment.
   */
  public static getAIConfig(): AIConfiguration {
    let provider: AIProvider = 'gemini'; // Default to Gemini
    let geminiApiKey: string | undefined;
    let localConfig: LocalAIConfig | undefined;

    // Check runtime config first
    // @ts-ignore
    if (typeof window !== 'undefined' && window._env_) {
      // @ts-ignore
      const env = window._env_;
      
      // Get provider
      if (env.AI_PROVIDER) {
        provider = env.AI_PROVIDER as AIProvider;
      }
      
      // Get Gemini key
      if (env.API_KEY && this.isValidKey(env.API_KEY)) {
        geminiApiKey = env.API_KEY.trim().replace(/^['"](.*)['"]$/, '$1');
      }
      
      // Get local AI config
      // Support empty baseUrl for proxy mode (relative URLs)
      if (env.LOCAL_AI_URL !== undefined || provider === 'ollama' || provider === 'local') {
        localConfig = {
          baseUrl: env.LOCAL_AI_URL || '',  // Empty string = use relative URLs (proxy mode)
          model: env.LOCAL_AI_MODEL || 'llama3.2',
          visionModel: env.LOCAL_AI_VISION_MODEL,
          apiKey: env.LOCAL_AI_KEY
        };
      }
    }

    // Check process.env as fallback
    if (!localConfig) {
      // @ts-ignore
      const processLocalUrl = (typeof process !== 'undefined' && process.env) ? process.env.LOCAL_AI_URL : undefined;
      if (processLocalUrl !== undefined) {
        // @ts-ignore
        const processEnv = process.env;
        localConfig = {
          baseUrl: processLocalUrl || '',
          // @ts-ignore
          model: processEnv.LOCAL_AI_MODEL || 'llama3.2',
          // @ts-ignore
          visionModel: processEnv.LOCAL_AI_VISION_MODEL,
          // @ts-ignore
          apiKey: processEnv.LOCAL_AI_KEY
        };
      }
    }

    // Check Vite env as final fallback
    if (!localConfig) {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        const viteUrl = import.meta.env.VITE_LOCAL_AI_URL;
        if (viteUrl) {
          localConfig = {
            baseUrl: viteUrl,
            // @ts-ignore
            model: import.meta.env.VITE_LOCAL_AI_MODEL || 'llama3.2',
            // @ts-ignore
            visionModel: import.meta.env.VITE_LOCAL_AI_VISION_MODEL,
            // @ts-ignore
            apiKey: import.meta.env.VITE_LOCAL_AI_KEY
          };
        }
        // @ts-ignore
        if (import.meta.env.VITE_AI_PROVIDER) {
          // @ts-ignore
          provider = import.meta.env.VITE_AI_PROVIDER as AIProvider;
        }
      }
    }

    // If no explicit provider set but local config exists, use local
    if (provider === 'gemini' && localConfig && !geminiApiKey) {
      provider = 'ollama';
    }

    return {
      provider,
      geminiApiKey,
      localConfig
    };
  }

  static hasApiKey(): boolean {
    const config = this.getAIConfig();
    return !!config.geminiApiKey || !!config.localConfig;
  }

  /**
   * Get the current provider type.
   */
  static getCurrentProvider(): AIProvider {
    return this.getAIConfig().provider;
  }

  /**
   * Initializes the AI Service based on configuration.
   * Priority: Local AI (if configured) > Gemini (if API key) > Mock Service
   */
  static async createService(): Promise<{ service: AIService; error?: string }> {
    const config = this.getAIConfig();

    // Try Local AI first if configured and requested
    if ((config.provider === 'ollama' || config.provider === 'local') && config.localConfig) {
      try {
        const service = new LocalAIService(config.localConfig);
        // Test connection
        const testResult = await service.testConnection();
        if (testResult.success) {
          console.log(`AIManager: Connected to Local AI at ${config.localConfig.baseUrl}`);
          return { service };
        } else {
          console.warn(`AIManager: Local AI connection failed: ${testResult.error}`);
          // Fall through to try Gemini
        }
      } catch (error: any) {
        console.warn(`AIManager: Failed to initialize Local AI: ${error.message}`);
        // Fall through to try Gemini
      }
    }

    // Try Gemini if API key available
    if (config.geminiApiKey) {
      try {
        const service = new GeminiService(config.geminiApiKey);
        return { service };
      } catch (error: any) {
        console.error("AIManager: Failed to instantiate GeminiService.", error);
        return { 
          service: new MockService(), 
          error: `Service Initialization Failed: ${error.message}` 
        };
      }
    }

    // Fallback to Mock Service
    console.warn("AIManager: No valid AI service configured. Using Mock Service.");
    return { 
      service: new MockService(), 
      error: "No AI service configured. Using Offline Simulation." 
    };
  }

  /**
   * Switch the AI service at runtime.
   * This can be used to toggle between Gemini and Local AI.
   */
  static async switchProvider(provider: AIProvider, localConfig?: LocalAIConfig): Promise<{ service: AIService; error?: string }> {
    if (provider === 'gemini') {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        return { 
          service: new MockService(), 
          error: "No Gemini API key configured" 
        };
      }
      try {
        const service = new GeminiService(apiKey);
        return { service };
      } catch (error: any) {
        return { 
          service: new MockService(), 
          error: `Failed to initialize Gemini: ${error.message}` 
        };
      }
    }

    if (provider === 'ollama' || provider === 'local') {
      const config = localConfig || this.getAIConfig().localConfig;
      if (!config) {
        return { 
          service: new MockService(), 
          error: "No Local AI configuration provided" 
        };
      }
      
      try {
        const service = new LocalAIService(config);
        const testResult = await service.testConnection();
        if (testResult.success) {
          return { service };
        } else {
          return { 
            service: new MockService(), 
            error: `Local AI connection failed: ${testResult.error}` 
          };
        }
      } catch (error: any) {
        return { 
          service: new MockService(), 
          error: `Failed to initialize Local AI: ${error.message}` 
        };
      }
    }

    return { 
      service: new MockService(), 
      error: `Unknown provider: ${provider}` 
    };
  }
}
