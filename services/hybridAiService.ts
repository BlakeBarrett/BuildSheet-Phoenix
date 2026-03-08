import { AIService, ArchitectResponse } from "./aiTypes.ts";
import { GeminiService } from "./geminiService.ts";
import { LocalArchitectService, LocalModelProvider } from "./localAiService.ts";
import { ShoppingOption, LocalSupplier, Part, InspectionProtocol, AssemblyPlan, EnclosureSpec } from "../types.ts";

export class HybridAIService implements AIService {
    public isOffline = false;
    private geminiService: GeminiService;
    private localService: LocalArchitectService | null = null;

    constructor(apiKey: string) {
        this.geminiService = new GeminiService(apiKey);
    }

    public setLocalArchitect(provider: LocalModelProvider | null) {
        if (provider) {
            this.localService = new LocalArchitectService(provider, this.geminiService);
        } else {
            this.localService = null;
        }
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

    async askArchitect(prompt: string, history: any[], image?: string): Promise<string> {
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

    async findPartSources(query: string): Promise<ShoppingOption[] | null> {
        return this.geminiService.findPartSources(query);
    }

    async findLocalSuppliers(query: string): Promise<LocalSupplier[] | null> {
        return this.geminiService.findLocalSuppliers(query);
    }

    async hydratePartDetails(name: string, category: string): Promise<Partial<Part> | null> {
        return this.geminiService.hydratePartDetails(name, category);
    }

    async verifyDesign(bom: any[], requirements: string, previousAudit?: string): Promise<ArchitectResponse> {
        return this.geminiService.verifyDesign(bom, requirements, previousAudit);
    }

    async generateFabricationBrief(partName: string, context: string): Promise<string> {
        return this.geminiService.generateFabricationBrief(partName, context);
    }

    async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
        return this.geminiService.generateQAProtocol(partName, category);
    }

    async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
        return this.geminiService.generateAssemblyPlan(bom, previousPlan);
    }

    async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
        return this.geminiService.generateEnclosure(context, bom);
    }

    async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
        return this.geminiService.getARGuidance(image, currentStep, plan);
    }
}
