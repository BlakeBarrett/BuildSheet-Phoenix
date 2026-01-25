// Gemini Service has been removed per request.
// This file is kept as a placeholder to prevent import errors if referenced elsewhere,
// but it is no longer used by the application logic.

import { AIService, ArchitectResponse } from "./aiTypes.ts";

export class GeminiService implements AIService {
  public name = "Gemini (Disabled)";
  public isOffline = true;

  constructor(apiKey: string) {
    console.warn("GeminiService is disabled.");
  }

  async askArchitect(prompt: string, history: any[]): Promise<string> {
    throw new Error("Gemini Service is disabled.");
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    return { reasoning: "Service Disabled", toolCalls: [] };
  }

  async generateProductImage(description: string): Promise<string | null> {
    return null;
  }
}