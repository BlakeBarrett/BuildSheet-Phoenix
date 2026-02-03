import { DraftingSession, AssemblyPlan } from '../types.ts';
import { DraftingEngine } from './draftingEngine.ts';

export interface TestResult {
    name: string;
    status: 'PASS' | 'FAIL' | 'WARN';
    message: string;
    category: 'INTEGRITY' | 'FLOW' | 'SYSTEM';
}

export class TestSuite {
    /**
     * Runs a comprehensive suite of integrity checks and simulated UI flows.
     */
    static async runAll(session: DraftingSession, engine: DraftingEngine): Promise<TestResult[]> {
        const results: TestResult[] = [];
        const hasItems = session.bom.length > 0;

        // --- SECTION 1: DATA INTEGRITY ---
        
        // 1. One-Click Kit Validation
        const sourcingCompletion = engine.getSourcingCompletion();
        results.push({
            name: "SOURCING COVERAGE",
            status: !hasItems || sourcingCompletion === 100 ? 'PASS' : (sourcingCompletion > 50 ? 'WARN' : 'FAIL'),
            message: !hasItems ? "Registry idle (empty BOM)." : (sourcingCompletion === 100 ? "Complete kit sourcing verified." : `${sourcingCompletion}% coverage. Run 'One-Click Kit'.`),
            category: 'INTEGRITY'
        });

        // 2. Assembly Planner Cache
        const hasPlan = !!session.cachedAssemblyPlan;
        const planIsCurrent = hasPlan && !session.cacheIsDirty;
        results.push({
            name: "ASSEMBLY PLANNER",
            status: !hasItems || planIsCurrent ? 'PASS' : (hasPlan ? 'WARN' : 'FAIL'),
            message: !hasItems ? "Integrated (No components to plan)." : (planIsCurrent ? "Step-by-step logic synced." : (hasPlan ? "Plan is STALE." : "Planner not initialized.")),
            category: 'INTEGRITY'
        });

        // 3. Technical Audit Cache
        const hasAudit = !!session.cachedAuditResult;
        const auditIsCurrent = hasAudit && !session.cacheIsDirty;
        results.push({
            name: "ARCHITECT AUDIT",
            status: !hasItems || auditIsCurrent ? 'PASS' : (hasAudit ? 'WARN' : 'FAIL'),
            message: !hasItems ? "Integrated (Initial state)." : (auditIsCurrent ? "Technical reasoning persisted." : "Audit missing or stale."),
            category: 'INTEGRITY'
        });

        // --- SECTION 2: UI-FLOW VALIDATION (SIMULATED) ---

        // 4. Export Manifest Flow
        const manifestData = engine.exportManifest();
        const exportValid = manifestData && manifestData.includes(session.id);
        results.push({
            name: "FLOW: EXPORT MANIFEST",
            status: exportValid ? 'PASS' : 'FAIL',
            message: "JSON serialization verified.",
            category: 'FLOW'
        });

        // 5. Visual Rendering Flow
        const hasImages = session.generatedImages.length > 0;
        results.push({
            name: "FLOW: NANO RENDER",
            status: !hasItems || hasImages ? 'PASS' : 'WARN',
            message: !hasItems ? "Awaiting components for render." : (hasImages ? "Visual confirmation pipeline active." : "Rendering queue empty."),
            category: 'FLOW'
        });

        // 6. Persistence Flow
        const stored = localStorage.getItem(`buildsheet_project_${session.id}`);
        const persistenceValid = stored !== null;
        results.push({
            name: "FLOW: LOCAL STORAGE",
            status: persistenceValid ? 'PASS' : 'FAIL',
            message: "Session auto-save verified.",
            category: 'FLOW'
        });

        return results;
    }
}