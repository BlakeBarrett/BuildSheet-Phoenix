

import { VisualManifest } from '../types.ts';

export interface ArchitectResponse {
  reasoning: string;
  toolCalls: any[];
  visualization?: VisualManifest;
}

export interface AIService {
  name: string;
  isOffline: boolean;
  
  /**
   * Sends the user prompt and history to the AI model.
   * @param image Optional Base64 Data URL string for multimodal input
   */
  askArchitect(prompt: string, history: any[], image?: string): Promise<string>;

  /**
   * Parses the raw text response from the model into structured commands.
   */
  parseArchitectResponse(text: string): ArchitectResponse;

  /**
   * Generates a visualization for the current design state.
   * @param referenceImage Optional Base64 Data URL to guide generation
   */
  generateProductImage(description: string, referenceImage?: string): Promise<string | null>;

  /**
   * Finds purchase options for a part using search grounding.
   */
  findPartSources?(query: string): Promise<{ options: { title: string; url: string; source: string }[] } | null>;

  /**
   * Uses Gemini 3.0 Thinking models to perform a deep technical audit of the BOM.
   */
  verifyDesign?(bom: any[], requirements: string): Promise<string>;

  /**
   * Generates a manufacturing specification for a custom/virtual part.
   */
  generateFabricationBrief?(partName: string, context: string): Promise<string>;
}