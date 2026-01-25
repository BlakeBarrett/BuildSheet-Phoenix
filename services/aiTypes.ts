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
   */
  askArchitect(prompt: string, history: any[]): Promise<string>;

  /**
   * Parses the raw text response from the model into structured commands.
   */
  parseArchitectResponse(text: string): ArchitectResponse;

  /**
   * Generates a visualization for the current design state.
   */
  generateProductImage(description: string): Promise<string | null>;
}