import { AIService, ArchitectResponse, AskArchitectResult } from "./aiTypes.ts";
import { CloudAIService } from "./cloudAiService.ts";
import { LocalArchitectService, LocalModelProvider, getLocalProvider } from "./localAiService.ts";
import { ShoppingOption, LocalSupplier, Part, InspectionProtocol, AssemblyPlan, EnclosureSpec } from "../types.ts";

/**
 * HybridAIService delegates between local models and the cloud AI service.
 *
 * ROUTING RULES:
 * - Generation tasks: route to the specific local service if configured,
 *   then fall back to Utility → Architect → Cloud AI.
 * - Search/Retrieval tasks (findPartSources, findLocalSuppliers, hydratePartDetails):
 *   ALWAYS go through the cloud AI service. Never routed locally.
 * - Image generation: local models return null; falls back to cloud AI if no local is set.
 */
export class HybridAIService implements AIService {
    public isOffline = false;
    private cloudAiService: CloudAIService;
    private localService: LocalArchitectService | null = null;
    private localAuditService: LocalArchitectService | null = null;
    private localPlanService: LocalArchitectService | null = null;
    private localCadService: LocalArchitectService | null = null;
    private localUtilityService: LocalArchitectService | null = null;

    constructor(apiKey: string) {
        this.cloudAiService = new CloudAIService(apiKey);
        this.reloadLocalProviders();
    }

    /**
     * Reload all local providers from localStorage.
     * Called on construction and whenever setLocalArchitect is called.
     */
    private reloadLocalProviders(): void {
        const auditProvider = getLocalProvider('localAuditProvider');
        this.localAuditService = auditProvider ? new LocalArchitectService(auditProvider) : null;

        const planProvider = getLocalProvider('localPlanProvider');
        this.localPlanService = planProvider ? new LocalArchitectService(planProvider) : null;

        const cadProvider = getLocalProvider('localCadProvider');
        this.localCadService = cadProvider ? new LocalArchitectService(cadProvider) : null;

        const utilityProvider = getLocalProvider('localUtilityProvider');
        this.localUtilityService = utilityProvider ? new LocalArchitectService(utilityProvider) : null;
    }

    public setLocalArchitect(provider: LocalModelProvider | null) {
        if (provider) {
            this.localService = new LocalArchitectService(provider);
        } else {
            this.localService = null;
        }
        this.reloadLocalProviders();
    }

    /**
     * Resolve + return the local service for a given role, with fallback chain:
     *   Specific slot → Utility → Architect → null (meaning: use Cloud API)
     */
    private getLocalFor(role: 'architect' | 'audit' | 'plan' | 'cad' | 'utility'): LocalArchitectService | null {
        const specific: Record<string, LocalArchitectService | null> = {
            architect: this.localService,
            audit: this.localAuditService,
            plan: this.localPlanService,
            cad: this.localCadService,
            utility: this.localUtilityService,
        };
        return specific[role] || this.localUtilityService || this.localService;
    }

    public get name() {
        if (this.localService) {
            return `Hybrid: ${this.localService.name} (Architect) + ${this.cloudAiService.name} (Search/Data)`;
        }
        return this.cloudAiService.name;
    }

    public getApiKeyStatus(): string {
        return this.cloudAiService.getApiKeyStatus();
    }

    // =====================
    // GENERATION TASKS — routed locally when configured
    // =====================

    async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
        const local = this.getLocalFor('architect');
        if (local) return local.askArchitect(prompt, history, image);
        return this.cloudAiService.askArchitect(prompt, history, image);
    }

    parseArchitectResponse(text: string): ArchitectResponse {
        return this.cloudAiService.parseArchitectResponse(text);
    }

    async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: import('../types.ts').AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: import('./aiTypes.ts').AuditAction[] }> {
        const local = this.getLocalFor('audit');
        if (local) return local.verifyDesign(bom, requirements, previousAudit, advancedChecks);
        return this.cloudAiService.verifyDesign(bom, requirements, previousAudit, advancedChecks);
    }

    async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
        const local = this.getLocalFor('plan');
        if (local) return local.generateAssemblyPlan(bom, previousPlan);
        return this.cloudAiService.generateAssemblyPlan(bom, previousPlan);
    }

    async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
        const local = this.getLocalFor('cad');
        if (local) return local.generateEnclosure(context, bom);
        return this.cloudAiService.generateEnclosure(context, bom);
    }

    async generateFabricationBrief(partName: string, context: string): Promise<string> {
        const local = this.getLocalFor('utility');
        if (local) return local.generateFabricationBrief(partName, context);
        return this.cloudAiService.generateFabricationBrief(partName, context);
    }

    async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
        const local = this.getLocalFor('utility');
        if (local) return local.generateQAProtocol(partName, category);
        return this.cloudAiService.generateQAProtocol(partName, category);
    }

    async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
        const local = this.getLocalFor('utility');
        if (local) return local.getARGuidance(image, currentStep, plan);
        return this.cloudAiService.getARGuidance(image, currentStep, plan);
    }

    async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: import('./aiTypes.ts').AuditAction[], summary: string }> {
        const local = this.getLocalFor('utility');
        if (local) return local.applyAuditRecommendations(bom, auditResult, requirements);
        return this.cloudAiService.applyAuditRecommendations(bom, auditResult, requirements);
    }

    async identifyComponent(image: string): Promise<import('./aiTypes.ts').ComponentIdentification | null> {
        const local = this.getLocalFor('utility');
        if (local) return local.identifyComponent(image);
        return this.cloudAiService.identifyComponent(image);
    }

    async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
        // Image generation: if ANY local model is configured, return null
        // (local text models can't generate images). Otherwise use Cloud API.
        const anyLocal = this.localService || this.localUtilityService;
        if (anyLocal) return null;
        return this.cloudAiService.generateProductImage(description, referenceImage);
    }

    // NOTE: findPartSources, hydratePartDetails, and findLocalSuppliers have been
    // moved to the server-side SearchService. Use sourcingApi from apiClient.ts.

}
