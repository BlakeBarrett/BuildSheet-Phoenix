/**
 * Shared type definitions for the server-side AI service.
 * 
 * These mirror the client-side AIService interface from services/aiTypes.ts
 * but are decoupled so the server doesn't import React-dependent code.
 */

// Re-export shared types from the common types file
// NOTE: In the server build, these are imported at runtime from the parent directory.
// The monorepo layout keeps types.ts as the single source of truth.

export interface ArchitectResponse {
  reasoning: string;
  toolCalls: any[];
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

export interface ShoppingOption {
  title: string;
  url: string;
  source: string;
  price?: string;
  currency?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  isEstimated?: boolean;
  /** True when the server probed this URL and confirmed it resolves (2xx after redirects). */
  validated?: boolean;
}

export interface LocalSupplier {
  name: string;
  address: string;
  rating?: number;
  openNow?: boolean;
  url?: string;
}

export interface InspectionProtocol {
  recommendedSensors: string[];
  defects: { name: string; severity: string; description: string }[];
  inspectionStrategy: string;
}

export interface AssemblyStep {
  stepNumber: number;
  description: string;
  requiredTool: string;
  estimatedTime: string;
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  totalTime: string;
  difficulty: string;
  requiredEndEffectors: string[];
  automationFeasibility: number;
  notes: string;
  generatedAt: Date;
}

export interface EnclosureSpec {
  material: string;
  dimensions: string;
  openSCAD?: string;
  description: string;
  renderUrl?: string;
}

export interface ComponentIdentification {
  name: string;
  category: string;
  brand: string;
  condition: string;
  conditionNotes: string;
  defects: string[];
  estimatedPrice: number;
  suggestedPartId: string;
  description: string;
  ports: { name: string; type: string; gender: string; spec: string }[];
}

export interface AdvancedValidationOption {
  id: string;
  label: string;
  enabled: boolean;
  kind: 'builtin' | 'custom';
  metadata?: string;
}

export interface AiConfig {
  provider: 'hosted' | 'openai-compat';
  baseUrl: string;
  imageBaseUrl: string;
  displayName: string;
  apiKey: string;
  searchApiKey: string;
  models: {
    fast: string;
    smart: string;
    structured: string;
    image: string;
    audio: string;
  };
}

/**
 * Server-side AI Service interface.
 * Mirrors the client AIService but runs in Node.js with direct API key access.
 */
export interface ServerAIService {
  name: string;
  isOffline: boolean;

  askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult>;
  parseArchitectResponse(text: string): ArchitectResponse;
  generateProductImage(description: string, referenceImage?: string): Promise<string | null>;
  findPartSources(query: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<ShoppingOption[] | null>;
  findLocalSuppliers(query: string): Promise<LocalSupplier[] | null>;
  hydratePartDetails(name: string, category: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<Partial<any> | null>;
  verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: AuditAction[] }>;
  generateFabricationBrief(partName: string, context: string): Promise<string>;
  generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null>;
  generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null>;
  generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null>;
  identifyComponent(image: string): Promise<ComponentIdentification | null>;
  applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: AuditAction[]; summary: string }>;
  getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string>;
  generateStructuredJson(prompt: string, schema: Record<string, any>): Promise<any>;
}
