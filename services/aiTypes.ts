
import { Part, VisualManifest, ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec, AdvancedValidationOption } from '../types.ts';

export interface ArchitectResponse {
  reasoning: string;
  toolCalls: any[];
  visualization?: VisualManifest;
  auditActions?: AuditAction[];
}

export interface AuditAction {
  type: 'addPart' | 'removePart';
  partId?: string;
  name?: string;
  category?: string;
  quantity?: number;
  instanceId?: string;
  reason: string;
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

  findPartSources?(query: string, designContext?: string): Promise<ShoppingOption[] | null>;

  findLocalSuppliers?(query: string, location?: { lat: number, lng: number }): Promise<LocalSupplier[] | null>;

  /**
   * Uses Google Search grounding to hydrate a virtual part with real-world data.
   */
  hydratePartDetails?(name: string, category: string, designContext?: string): Promise<Partial<Part> | null>;

  verifyDesign?(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: AuditAction[] }>;

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

  /**
   * Uses structured function calling to extract concrete BOM changes from an audit result.
   * Returns typed actions instead of relying on text parsing.
   */
  applyAuditRecommendations?(bom: any[], auditResult: string, requirements: string): Promise<{ actions: AuditAction[], summary: string }>;

  /**
   * Multimodal Visual Parts Audit: Identifies a hardware component from a photo.
   * Returns identification, condition report, and suggested BOM entry.
   */
  identifyComponent?(image: string): Promise<ComponentIdentification | null>;
}

export interface ComponentIdentification {
  name: string;
  category: string;
  brand: string;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';
  conditionNotes: string;
  defects: string[];
  estimatedPrice: number;
  suggestedPartId: string;
  description: string;
  ports: { name: string; type: string; gender: string; spec: string }[];
}
