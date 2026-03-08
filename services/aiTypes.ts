
import { Part, VisualManifest, ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec } from '../types.ts';

export interface ArchitectResponse {
  reasoning: string;
  toolCalls: any[];
  visualization?: VisualManifest;
}

export interface AskArchitectResult {
  text: string;
  metadata?: {
    model?: string;
    tokens?: number;
    [key: string]: any;
  };
}

export interface AIService {
  name: string;
  isOffline: boolean;

  /**
   * Returns a safe, masked status of the API key currently in use.
   * Used for unit testing and diagnostics.
   */
  getApiKeyStatus(): string;

  askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult>;

  parseArchitectResponse(text: string): ArchitectResponse;

  generateProductImage(description: string, referenceImage?: string): Promise<string | null>;

  findPartSources?(query: string): Promise<ShoppingOption[] | null>;

  findLocalSuppliers?(query: string, location?: { lat: number, lng: number }): Promise<LocalSupplier[] | null>;

  /**
   * Uses Google Search grounding to hydrate a virtual part with real-world data.
   */
  hydratePartDetails?(name: string, category: string): Promise<Partial<Part> | null>;

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
