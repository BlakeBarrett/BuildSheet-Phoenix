
import { VisualManifest, ShoppingOption, LocalSupplier, InspectionProtocol } from '../types.ts';

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
   * Finds online purchase options using Google Search grounding.
   */
  findPartSources?(query: string): Promise<ShoppingOption[] | null>;

  /**
   * Finds local suppliers using Google Maps grounding.
   */
  findLocalSuppliers?(query: string, location?: { lat: number, lng: number }): Promise<LocalSupplier[] | null>;

  /**
   * Uses Gemini 3.0 Thinking models to perform a deep technical audit of the BOM.
   * Updated to return structured response.
   */
  verifyDesign?(bom: any[], requirements: string): Promise<ArchitectResponse>;

  /**
   * Generates a manufacturing specification for a custom/virtual part.
   */
  generateFabricationBrief?(partName: string, context: string): Promise<string>;

  /**
   * Generates a Quality Assurance protocol for Google Visual Inspection AI.
   */
  generateQAProtocol?(partName: string, category: string): Promise<InspectionProtocol | null>;
}