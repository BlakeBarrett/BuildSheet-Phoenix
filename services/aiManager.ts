import { AIService } from './aiTypes.ts';
import { MockService } from './mockService.ts';

export class AIManager {
  
  static hasApiKey(): boolean {
    return false; // Force offline/mock mode
  }

  /**
   * Initializes the AI Service.
   * Currently forced to MockService as Gemini integration is removed.
   */
  static async createService(): Promise<{ service: AIService, error?: string }> {
    console.log("AIManager: returning MockService (Gemini disabled).");
    return { service: new MockService() };
  }
}