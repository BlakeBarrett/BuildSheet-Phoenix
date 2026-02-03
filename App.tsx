import React, { Component, useState, useRef, useEffect, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { DraftingSession, UserMessage, User, BOMEntry, Part, AssemblyPlan, EnclosureSpec } from './types.ts';
import { Button, Chip, Card, GoogleSignInButton } from './components/Material3UI.tsx';
import { ChiltonVisualizer } from './components/ChiltonVisualizer.tsx';
import { useService } from './contexts/ServiceContext.tsx';
import { ARGuideView } from './components/ARGuideView.tsx';
import { TestSuite, TestResult } from './services/testSuite.ts';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps { children?: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Uncaught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-[#1E1E1E] text-white p-8">
            <div className="max-w-lg">
                <h1 className="text-2xl font-bold text-[#FFB4AB] mb-4">System Critical Failure</h1>
                <p className="mb-4 text-[#E2E2E2]">The application encountered an unrecoverable error.</p>
                <pre className="bg-black/30 p-4 rounded-xl text-xs font-mono overflow-auto border border-[#FFB4AB]/30">{this.state.error?.message}</pre>
                <Button onClick={() => window.location.reload()} variant="tonal" className="mt-6">Reboot System</Button>
            </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- MODAL COMPONENTS ---

const ValidationReportModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    results: TestResult[];
    isRunning: boolean;
    onRunAgain: () => void;
    onFixAll?: () => Promise<void>;
}> = ({ isOpen, onClose, results, isRunning, onRunAgain, onFixAll }) => {
    const [isFixing, setIsFixing] = useState(false);
    if (!isOpen) return null;

    const handleFix = async () => {
        if (!onFixAll) return;
        setIsFixing(true);
        try {
            await onFixAll();
            onRunAgain();
        } finally {
            setIsFixing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-bold text-slate-800">System Integrity Suite</h3>
                        <p className="text-[10px] text-gray-400 font-mono tracking-tighter">BUILD: BS-PHOENIX-STABLE</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800" disabled={isFixing || isRunning}>&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-slate-900 font-mono text-sm leading-relaxed text-indigo-100">
                    {(isRunning || isFixing) ? (
                        <div className="space-y-2">
                             <p className="animate-pulse text-indigo-400">>> {isFixing ? 'REPAIRING ROLES (ARCHITECT, SOURCER)...' : 'INITIALIZING PROBES...'}</p>
                             <p className="animate-pulse text-indigo-300 delay-75">>> ANALYZING BUILD SHEET INTEGRITY...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-[10px] text-indigo-500 font-bold mb-3 tracking-widest uppercase text-left">Draft Integrity</h4>
                                {results.filter(r => r.category === 'INTEGRITY').map((res, i) => (
                                    <div key={i} className="flex gap-4 border-b border-white/5 pb-3 mb-3">
                                        <span className={res.status === 'PASS' ? 'text-emerald-400' : res.status === 'FAIL' ? 'text-rose-400' : 'text-amber-400'}>
                                            [{res.status}]
                                        </span>
                                        <div className="text-left">
                                            <p className="font-bold text-white uppercase text-xs">{res.name}</p>
                                            <p className="text-[11px] text-indigo-300/70">{res.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <h4 className="text-[10px] text-indigo-500 font-bold mb-3 tracking-widest uppercase text-left">UI Flows & Stability</h4>
                                {results.filter(r => r.category === 'FLOW').map((res, i) => (
                                    <div key={i} className="flex gap-4 border-b border-white/5 pb-3 mb-3">
                                        <span className={res.status === 'PASS' ? 'text-emerald-400' : res.status === 'FAIL' ? 'text-rose-400' : 'text-amber-400'}>
                                            [{res.status}]
                                        </span>
                                        <div className="text-left">
                                            <p className="font-bold text-white uppercase text-xs">{res.name}</p>
                                            <p className="text-[11px] text-indigo-300/70">{res.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-2">
                    {results.some(r => r.status !== 'PASS') && !isFixing && !isRunning && (
                        <Button onClick={handleFix} variant="tonal" className="bg-indigo-50 text-indigo-700">One-Click Repair</Button>
                    )}
                    <Button onClick={onRunAgain} variant="secondary" disabled={isRunning || isFixing}>Rerun Tests</Button>
                    <Button onClick={onClose} variant="primary" disabled={isFixing || isRunning}>Close</Button>
                </div>
             </div>
        </div>
    );
};

const PartDetailModal: React.FC<{
    entry: BOMEntry | null;
    onClose: () => void;
    onSource: (entry: BOMEntry) => void;
}> = ({ entry, onClose, onSource }) => {
    if (!entry) return null;
    return (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                            {entry.part.category[0] || 'P'}
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">{entry.part.name}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Description</label>
                            <p className="text-sm text-slate-600 leading-relaxed mt-1">{entry.part.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">SKU</label>
                                <p className="text-xs font-mono">{entry.part.sku}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Price</label>
                                <p className="text-xs">${entry.part.price.toFixed(2)}</p>
                            </div>
                        </div>
                        {entry.sourcing?.online && entry.sourcing.online.length > 0 && (
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Sourcing Links</label>
                                <div className="mt-2 space-y-2">
                                    {entry.sourcing.online.map((s, i) => (
                                        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors">
                                            {s.title} ({s.source})
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex flex-wrap gap-2 justify-end">
                    <Button variant="tonal" onClick={() => onSource(entry)} className="text-xs">Update Sourcing</Button>
                    <Button variant="primary" onClick={onClose}>Close</Button>
                </div>
             </div>
        </div>
    );
};

const AssemblyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    plan: AssemblyPlan | null;
    isRunning: boolean;
    isDirty: boolean;
    onLaunchAR: () => void;
    onRefresh: () => void;
}> = ({ isOpen, onClose, plan, isRunning, isDirty, onLaunchAR, onRefresh }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRunning ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                            {isRunning ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"><path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Robotic Assembly Planner</h3>
                            {isDirty && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold ml-2">STALE</span>}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-white font-sans text-sm leading-relaxed text-slate-600">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
                            <p className="text-gray-400 font-medium animate-pulse">Calculating kinematics & collisions...</p>
                        </div>
                    ) : plan ? (
                        <div className="space-y-6">
                            {isDirty && (
                                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex justify-between items-center">
                                    <p className="text-xs text-red-600 font-medium">Draft changed since this plan was generated.</p>
                                    <Button onClick={onRefresh} variant="tonal" className="text-[10px] h-7 px-3 bg-red-100 text-red-700">Refresh Plan</Button>
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                    <div className="text-[10px] uppercase font-bold text-blue-400 mb-1">Feasibility</div>
                                    <div className="text-2xl font-bold text-blue-700">{plan.automationFeasibility}%</div>
                                </div>
                                <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                                    <div className="text-[10px] uppercase font-bold text-orange-400 mb-1">Difficulty</div>
                                    <div className="text-xl font-bold text-orange-700">{plan.difficulty}</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">Est. Time</div>
                                    <div className="text-xl font-bold text-slate-700">{plan.totalTime}</div>
                                </div>
                            </div>
                            <div className="p-4 bg-indigo-600 rounded-2xl text-white flex justify-between items-center shadow-lg shadow-indigo-100">
                                <div>
                                    <h4 className="font-bold text-sm">Multimodal AR Guide</h4>
                                    <p className="text-white/70 text-xs">Use your camera for step-by-step guidance.</p>
                                </div>
                                <Button onClick={onLaunchAR} className="bg-white text-indigo-600 border-none px-4 py-2 text-xs">Launch AR</Button>
                            </div>
                            <div>
                                <h4 className="font-bold text-xs uppercase text-slate-800 mb-3">Assembly Sequence</h4>
                                <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-0 before:w-0.5 before:bg-gray-100">
                                    {plan.steps.map((step, i) => (
                                        <div key={i} className="relative pl-10">
                                            <div className="absolute left-0 top-0 w-8 h-8 bg-white border-2 border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs shadow-sm z-10">{step.stepNumber}</div>
                                            <div className="bg-[#F8FAFC] border border-gray-100 rounded-xl p-4">
                                                <div className="font-medium text-slate-800 mb-1">{step.description}</div>
                                                <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-wide mt-2"><span>Using: {step.requiredTool}</span><span>⏱ {step.estimatedTime}</span></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : <div className="text-center text-gray-400">No plan generated.</div>}
                </div>
                {!isRunning && <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end"><Button onClick={onClose} variant="primary">Done</Button></div>}
             </div>
        </div>
    );
};

const AuditModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    result: string | null;
    isRunning: boolean;
    isDirty: boolean;
    onRefresh: () => void;
}> = ({ isOpen, onClose, result, isRunning, isDirty, onRefresh }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-900 text-white`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 3.040 12.02 12.02 0 00-3.131 8.903 12.01 12.01 0 007.97 10.743l.779.275.779-.275a12.01 12.01 0 007.97-10.743 12.02 12.02 0 00-3.131-8.903z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">System Integrity Audit</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-[#F8FAFC]">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
                            <p className="text-gray-400 font-medium">Gemini Thinking (Heavy Reasoner)...</p>
                        </div>
                    ) : (
                        <div className="prose prose-slate max-w-none text-left">
                            {isDirty && (
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex justify-between items-center mb-6">
                                    <p className="text-xs text-amber-700 font-medium m-0">This audit might be outdated due to BOM changes.</p>
                                    <Button onClick={onRefresh} variant="tonal" className="text-[10px] h-7 px-3 bg-amber-100 text-amber-800 border-none">Update Audit</Button>
                                </div>
                            )}
                            <ReactMarkdown>{result || "Run an audit to see technical and legal verification."}</ReactMarkdown>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-white flex justify-end"><Button onClick={onClose} variant="primary">Close</Button></div>
             </div>
        </div>
    );
};

const AppContent: React.FC = () => {
  const { service: aiService } = useService();
  const [draftingEngine] = useState(() => getDraftingEngine());
  const [session, setSession] = useState<DraftingSession>(draftingEngine.getSession());
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [isBomOpen, setIsBomOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  
  const [selectedPart, setSelectedPart] = useState<BOMEntry | null>(null);
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const [isPlanningAssembly, setIsPlanningAssembly] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);

  // Validation State
  const [validationOpen, setValidationOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<TestResult[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const refreshState = () => setSession(draftingEngine.getSession());

  const handleSourcePart = async (entry: BOMEntry) => {
      setSession(prev => ({
          ...prev,
          bom: prev.bom.map(b => b.instanceId === entry.instanceId ? { ...b, sourcing: { ...b.sourcing, loading: true } } : b)
      }));
      try {
          const result = await aiService.findPartSources?.(entry.part.name);
          if (result) {
             draftingEngine.updatePartSourcing(entry.instanceId, result);
             refreshState();
          }
      } catch (e) { console.error(e); }
  };

  const handleOneClickKit = async () => {
    const latestSession = draftingEngine.getSession();
    if (latestSession.bom.length === 0) return;
    
    // 1. Sourcing
    for (const entry of latestSession.bom) {
      if (!entry.sourcing?.online?.length) {
        await handleSourcePart(entry);
      }
    }
    
    // 2. Rendering (if missing)
    const currentSession = draftingEngine.getSession();
    if (currentSession.generatedImages.length === 0) {
        await handleGenerateVisual();
    }
    
    // 3. Technical Audit
    await handleVerifyAudit();
    
    // 4. Assembly Planning
    await handlePlanAssembly();
    
    refreshState();
  };

  const handleVerifyAudit = async () => {
      const currentSession = draftingEngine.getSession();
      if (!aiService.verifyDesign || currentSession.bom.length === 0) return;
      setAuditOpen(true);
      setIsAuditing(true);
      try {
          const res = await aiService.verifyDesign(currentSession.bom, currentSession.designRequirements, currentSession.cachedAuditResult);
          draftingEngine.cacheAuditResult(res.reasoning);
          refreshState();
      } catch (e) { console.error(e); } finally { setIsAuditing(false); }
  };

  const handlePlanAssembly = async () => {
      const currentSession = draftingEngine.getSession();
      if (!aiService.generateAssemblyPlan || currentSession.bom.length === 0) return;
      setAssemblyOpen(true);
      setIsPlanningAssembly(true);
      try {
          const plan = await aiService.generateAssemblyPlan(currentSession.bom, currentSession.cachedAssemblyPlan);
          if (plan) {
              draftingEngine.cacheAssemblyPlan(plan);
              refreshState();
          }
      } catch (e) { console.error(e); } finally { setIsPlanningAssembly(false); }
  };

  const handleGenerateVisual = async () => {
      const currentSession = draftingEngine.getSession();
      if (isVisualizing || currentSession.bom.length === 0) return;
      setIsVisualizing(true);
      try {
          const requirements = currentSession.designRequirements || currentSession.name || "Hardware assembly";
          const imageUrl = await aiService.generateProductImage(requirements);
          if (imageUrl) {
              draftingEngine.addGeneratedImage(imageUrl, `Design concept for: ${requirements}`);
              refreshState();
          }
      } catch (e) { console.error(e); } finally { setIsVisualizing(false); }
  };

  const handleExport = () => {
    const manifest = draftingEngine.exportManifest();
    const blob = new Blob([manifest], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `buildsheet-manifest-${session.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runValidationSuite = async () => {
      setValidationOpen(true);
      setIsValidating(true);
      await new Promise(r => setTimeout(r, 1200));
      const results = await TestSuite.runAll(draftingEngine.getSession(), draftingEngine);
      setValidationResults(results);
      setIsValidating(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    draftingEngine.addMessage({ role: 'user', content: input, timestamp: new Date() });
    refreshState();
    const tempInput = input;
    setInput('');
    setIsThinking(true);
    try {
        const history = session.messages.map(m => ({ role: m.role, parts: [{ text: m.content }] }));
        const architectResponse = await aiService.askArchitect(tempInput, history);
        const parsed = aiService.parseArchitectResponse(architectResponse);
        
        let stateModified = false;
        parsed.toolCalls.forEach(call => {
            if (call.type === 'initializeDraft') { draftingEngine.initialize(call.name, call.reqs); stateModified = true; }
            else if (call.type === 'addPart') { draftingEngine.addPart(call.partId, call.qty); stateModified = true; }
            else if (call.type === 'removePart') { draftingEngine.removePart(call.instanceId); stateModified = true; }
        });
        
        draftingEngine.addMessage({ role: 'assistant', content: parsed.reasoning || architectResponse, timestamp: new Date() });
        if (stateModified) handleGenerateVisual();
        refreshState();
    } catch (e: any) {
        draftingEngine.addMessage({ role: 'assistant', content: `[ERROR] ${e.message}`, timestamp: new Date() });
        refreshState();
    } finally { setIsThinking(false); }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#F3F4F6] text-[#1F1F1F] overflow-hidden font-sans relative flex-col md:flex-row">
      <ValidationReportModal 
        isOpen={validationOpen} 
        onClose={() => setValidationOpen(false)} 
        results={validationResults} 
        isRunning={isValidating} 
        onRunAgain={runValidationSuite} 
        onFixAll={handleOneClickKit} 
      />
      <AssemblyModal isOpen={assemblyOpen} onClose={() => setAssemblyOpen(false)} plan={session.cachedAssemblyPlan || null} isRunning={isPlanningAssembly} isDirty={session.cacheIsDirty} onLaunchAR={() => setArOpen(true)} onRefresh={handlePlanAssembly} />
      <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} result={session.cachedAuditResult || null} isRunning={isAuditing} isDirty={session.cacheIsDirty} onRefresh={handleVerifyAudit} />
      <PartDetailModal entry={selectedPart} onClose={() => setSelectedPart(null)} onSource={handleSourcePart} />
      {arOpen && session.cachedAssemblyPlan && <ARGuideView plan={session.cachedAssemblyPlan} aiService={aiService} onClose={() => setArOpen(false)} />}

      {/* Restore Sidebar Layout */}
      <nav className="hidden md:flex w-[88px] border-r border-gray-200 bg-white flex-col items-center py-6 gap-6 z-20 shadow-sm">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">B</div>
        <div className="flex flex-col gap-4 flex-1 items-center">
            <button onClick={() => { draftingEngine.createNewProject(); refreshState(); }} className="w-12 h-12 flex items-center justify-center text-indigo-600 bg-indigo-50 rounded-2xl hover:bg-indigo-100 transition-colors" title="New Project"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg></button>
            <button onClick={handleExport} className="w-12 h-12 flex items-center justify-center text-emerald-600 bg-emerald-50 rounded-2xl hover:bg-emerald-100 transition-colors" title="Export Manifest"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></button>
            <button onClick={runValidationSuite} className="w-12 h-12 flex items-center justify-center text-rose-600 bg-rose-50 rounded-2xl hover:bg-rose-100 transition-colors" title="Integrity Tests"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 3.040 12.02 12.02 0 00-3.131 8.903 12.01 12.01 0 007.97 10.743l.779.275.779-.275a12.01 12.01 0 007.97-10.743 12.02 12.02 0 00-3.131-8.903z"></path></svg></button>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Main Feed Content Area */}
        <section className="flex-1 flex flex-col border-r border-gray-200 bg-white">
          <header className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <h1 className="font-medium text-xl tracking-tight text-slate-900">{session.name || "Untitled Draft"}</h1>
            <div className="flex gap-2 items-center">
                {session.cacheIsDirty && session.bom.length > 0 && <Chip label="MODIFIED" color="bg-amber-50 text-amber-600 font-bold border-amber-100" />}
                <button onClick={() => setIsBomOpen(!isBomOpen)} className="p-2 text-slate-400 hover:text-slate-800 transition-colors"><svg className={`w-5 h-5 transition-transform ${isBomOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
            </div>
          </header>

          {/* Visualizer Header */}
          <div className="bg-[#F8FAFC] border-b border-gray-200 p-4 h-[35%]">
             <ChiltonVisualizer images={session.generatedImages} onGenerate={handleGenerateVisual} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
          </div>

          {/* Message Thread */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white">
            {session.messages.length === 0 && (
                <div className="text-center py-10 opacity-40">
                    <p className="text-sm font-medium">Describe your hardware project to begin drafting.</p>
                </div>
            )}
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[24px] px-6 py-4 shadow-sm ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-[#F1F5F9] text-slate-800'}`}>
                  <ReactMarkdown className="prose prose-sm max-w-none prose-slate">{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isThinking && <div className="flex justify-start"><div className="bg-[#F1F5F9] rounded-[24px] px-6 py-4 animate-pulse text-slate-400 text-sm">Architect is reasoning...</div></div>}
            <div ref={chatEndRef} />
          </div>

          <footer className="p-6 border-t border-gray-100 bg-white">
            <div className="relative max-w-4xl mx-auto">
                <textarea 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="E.g. Build a mechanical keyboard with linear switches..." 
                    className="w-full pl-6 pr-16 py-4 bg-[#F1F5F9] border-none rounded-[28px] text-sm resize-none outline-none focus:ring-2 ring-indigo-500/20" 
                    rows={1} 
                />
                <button onClick={handleSend} className="absolute right-2 top-2 w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-slate-800 transition-colors shadow-sm"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>
            </div>
          </footer>
        </section>

        {/* Right Sidebar BOM */}
        {isBomOpen && (
          <section className="w-[450px] flex flex-col bg-white border-l border-gray-200 shadow-lg animate-in slide-in-from-right duration-300">
            <header className="px-6 py-6 border-b border-gray-200 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-xs uppercase tracking-widest text-slate-500">Bill of Materials</h2>
                <div className="text-2xl font-mono font-bold text-indigo-600">${draftingEngine.getTotalCost().toLocaleString()}</div>
              </div>
              <Button variant="secondary" className="w-full text-xs h-9 font-bold bg-indigo-50 text-indigo-700 border-none shadow-none" onClick={handleOneClickKit}>
                {draftingEngine.getSourcingCompletion() === 100 && !session.cacheIsDirty ? 'Build Stabilized' : 'One-Click Kit'}
              </Button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]">
              {session.bom.map(entry => (
                <Card key={entry.instanceId} className="p-4 hover:shadow-md cursor-pointer transition-all border-none bg-white shadow-sm" onClick={() => setSelectedPart(entry)}>
                  <div className="flex justify-between items-center">
                    <div>
                        <div className="font-bold text-sm text-slate-800">{entry.part.name}</div>
                        <div className="flex gap-2 items-center mt-1">
                            <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{entry.part.sku}</span>
                            <span className="text-[10px] text-slate-400 font-medium">x{entry.quantity}</span>
                            {entry.sourcing?.online?.length ? <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Sourced</span> : <span className="text-[9px] bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Missing Link</span>}
                        </div>
                    </div>
                    <div className="text-xs font-bold text-slate-900">${(entry.part.price * entry.quantity).toLocaleString()}</div>
                  </div>
                </Card>
              ))}
              {session.bom.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-12 py-32">
                    <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <p className="text-sm font-medium">Add components to populate the build sheet.</p>
                  </div>
              )}
            </div>

            <footer className="p-6 border-t border-gray-200 grid grid-cols-2 gap-3 bg-white">
              <Button onClick={handleVerifyAudit} className={`text-white text-xs h-10 transition-all ${session.cacheIsDirty ? 'bg-indigo-600 shadow-lg' : 'bg-slate-900 opacity-60'}`}>
                {session.cachedAuditResult && !session.cacheIsDirty ? 'View Audit' : 'Verify Design'}
              </Button>
              <Button onClick={handlePlanAssembly} className={`text-white text-xs h-10 transition-all ${session.cacheIsDirty ? 'bg-blue-600 shadow-lg' : 'bg-blue-800 opacity-60'}`}>
                {session.cachedAssemblyPlan && !session.cacheIsDirty ? 'View Plan' : 'Plan Assembly'}
              </Button>
            </footer>
          </section>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => (
    <ErrorBoundary>
        <AppContent />
    </ErrorBoundary>
);

export default App;