/**
 * ServerAiService — client-side AIService implementation that routes every AI
 * call through the BuildSheet backend API (/api/v1/).
 *
 * No AI API keys are held or used in the browser.  All provider routing,
 * model selection, and credential management happen server-side.
 */
import type {
  AIService,
  ArchitectResponse,
  AskArchitectResult,
  AuditAction,
  ComponentIdentification,
} from './aiTypes.ts';
import type { InspectionProtocol, AssemblyPlan, EnclosureSpec } from '../types.ts';
import { architectApi, generationApi } from './apiClient.ts';
import { parseArchitectResponse } from './parseUtils.ts';

export class ServerAiService implements AIService {
  public name: string;
  public isOffline: boolean;

  constructor(name = 'BuildSheet AI', isOffline = false) {
    this.name = name;
    this.isOffline = isOffline;
  }

  getApiKeyStatus(): string {
    return 'managed-by-server';
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    return parseArchitectResponse(text);
  }

  async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
    const result = await architectApi.chat(prompt, history, image) as { text: string; metadata?: any };
    return { text: result.text, metadata: result.metadata };
  }

  async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
    const result = await generationApi.image(description, referenceImage);
    return result.url;
  }

  async verifyDesign(
    bom: any[], requirements: string, previousAudit?: string, advancedChecks?: any[]
  ): Promise<ArchitectResponse & { auditActions?: AuditAction[] }> {
    return architectApi.verify(bom, requirements, previousAudit, advancedChecks);
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    const result = await generationApi.fabrication(partName, context);
    return result.brief;
  }

  async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
    return generationApi.qaProtocol(partName, category);
  }

  async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
    return architectApi.assemblyPlan(bom, previousPlan);
  }

  async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
    return generationApi.enclosure(context, bom);
  }

  async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
    return generationApi.arGuidance(image, currentStep, plan);
  }

  async applyAuditRecommendations(
    bom: any[], auditResult: string, requirements: string
  ): Promise<{ actions: AuditAction[]; summary: string }> {
    return architectApi.applyAudit(bom, auditResult, requirements);
  }

  async identifyComponent(image: string): Promise<ComponentIdentification | null> {
    return generationApi.identify(image);
  }
}
