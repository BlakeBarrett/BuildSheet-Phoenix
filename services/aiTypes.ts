
import { VisualManifest, ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec } from '../types.ts';

export interface ArchitectResponse {
  reasoning: string;
  toolCalls: any[];
  visualization?: VisualManifest;
}

export interface AIService {
  name: string;
  isOffline: boolean;
  
  /**
   * Returns a safe, masked status of the API key currently in use.
   * Used for unit testing and diagnostics.
   */
  getApiKeyStatus(): string;

  askArchitect(prompt: string, history: any[], image?: string): Promise<string>;

  parseArchitectResponse(text: string): ArchitectResponse;

  generateProductImage(description: string, referenceImage?: string): Promise<string | null>;

  findPartSources?(query: string): Promise<ShoppingOption[] | null>;

  findLocalSuppliers?(query: string, location?: { lat: number, lng: number }): Promise<LocalSupplier[] | null>;

  verifyDesign?(bom: any[], requirements: string, previousAudit?: string): Promise<ArchitectResponse>;

  generateFabricationBrief?(partName: string, context: string): Promise<string>;

  generateQAProtocol?(partName: string, category: string): Promise<InspectionProtocol | null>;

  generateAssemblyPlan?(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null>;

  /**
   * Generates a 3D-printable enclosure specification (Text-to-CAD).
   */
  generateEnclosure?(context: string, bom: any[]): Promise<EnclosureSpec | null>;

  /**
   * Multimodal AR Guidance: Analyzes a camera frame and provides assembly instructions.
   */
  getARGuidance?(image: string, currentStep: number, plan: AssemblyPlan): Promise<string>;
}
