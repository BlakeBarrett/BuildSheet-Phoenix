import { AIService, ArchitectResponse, AskArchitectResult } from "./aiTypes.ts";
import { GeminiService } from "./geminiService.ts";
import { LocalArchitectService, LocalModelProvider, getLocalProvider } from "./localAiService.ts";
import { ShoppingOption, LocalSupplier, Part, InspectionProtocol, AssemblyPlan, EnclosureSpec } from "../types.ts";

export class HybridAIService implements AIService {
    public isOffline = false;
    private geminiService: GeminiService;
    private localService: LocalArchitectService | null = null;
    private localAuditService: LocalArchitectService | null = null;
    private localPlanService: LocalArchitectService | null = null;

    constructor(apiKey: string) {
        this.geminiService = new GeminiService(apiKey);
        // Auto-load audit/plan providers from localStorage
        const auditProvider = getLocalProvider('localAuditProvider');
        if (auditProvider) {
            this.localAuditService = new LocalArchitectService(auditProvider, this.geminiService);
        }
        const planProvider = getLocalProvider('localPlanProvider');
        if (planProvider) {
            this.localPlanService = new LocalArchitectService(planProvider, this.geminiService);
        }
    }

    public setLocalArchitect(provider: LocalModelProvider | null) {
        if (provider) {
            this.localService = new LocalArchitectService(provider, this.geminiService);
        } else {
            this.localService = null;
        }
        // Re-read audit/plan providers in case they changed
        const auditProvider = getLocalProvider('localAuditProvider');
        this.localAuditService = auditProvider ? new LocalArchitectService(auditProvider, this.geminiService) : null;
        const planProvider = getLocalProvider('localPlanProvider');
        this.localPlanService = planProvider ? new LocalArchitectService(planProvider, this.geminiService) : null;
    }

    public get name() {
        if (this.localService) {
            return `Hybrid: ${this.localService.name} (Architect) + Gemini (Vision/Data)`;
        }
        return this.geminiService.name;
    }

    public getApiKeyStatus(): string {
        return this.geminiService.getApiKeyStatus();
    }

    // --- DELEGATED HYBRID FUNCTIONS ---

    async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
        if (this.localService) {
            return this.localService.askArchitect(prompt, history, image);
        }
        return this.geminiService.askArchitect(prompt, history, image);
    }

    parseArchitectResponse(text: string): ArchitectResponse {
        return this.geminiService.parseArchitectResponse(text);
    }

    // --- GEMINI FUNCTIONS ---

    async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
        return this.geminiService.generateProductImage(description, referenceImage);
    }

    async findPartSources(query: string, designContext?: string): Promise<ShoppingOption[] | null> {
        return this.geminiService.findPartSources(query, designContext);
    }

    async findLocalSuppliers(query: string): Promise<LocalSupplier[] | null> {
        return this.geminiService.findLocalSuppliers(query);
    }

    async hydratePartDetails(name: string, category: string, designContext?: string): Promise<Partial<Part> | null> {
        return this.geminiService.hydratePartDetails(name, category, designContext);
    }

    async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: import('../types.ts').AdvancedValidationOption[]): Promise<ArchitectResponse> {
        if (this.localAuditService) {
            return this.localAuditService.verifyDesign(bom, requirements, previousAudit, advancedChecks);
        }
        return this.geminiService.verifyDesign(bom, requirements, previousAudit, advancedChecks);
    }

    async generateFabricationBrief(partName: string, context: string): Promise<string> {
        return this.geminiService.generateFabricationBrief(partName, context);
    }

    async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
        return this.geminiService.generateQAProtocol(partName, category);
    }

    async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
        if (this.localPlanService) {
            return this.localPlanService.generateAssemblyPlan(bom, previousPlan);
        }
        return this.geminiService.generateAssemblyPlan(bom, previousPlan);
    }

    async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
        return this.geminiService.generateEnclosure(context, bom);
    }

    async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
        return this.geminiService.getARGuidance(image, currentStep, plan);
    }

    async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: import('./aiTypes.ts').AuditAction[], summary: string }> {
        return this.geminiService.applyAuditRecommendations(bom, auditResult, requirements);
    }

    async identifyComponent(image: string): Promise<import('./aiTypes.ts').ComponentIdentification | null> {
        return this.geminiService.identifyComponent(image);
    }
}
