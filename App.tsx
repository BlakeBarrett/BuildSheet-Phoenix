
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

// --- NEW MODAL COMPONENTS ---

// Fixed: Added PartDetailModal component which was missing in the previous version
const PartDetailModal: React.FC<{
    entry: BOMEntry | null;
    onClose: () => void;
    onFabricate: (entry: BOMEntry) => void;
    onSource: (entry: BOMEntry) => void;
    onManualSource: (entry: BOMEntry) => void;
    onLocate: (entry: BOMEntry) => void;
}> = ({ entry, onClose, onFabricate, onSource, onManualSource, onLocate }) => {
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
                        {entry.part.ports && entry.part.ports.length > 0 && (
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Interface Ports</label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {entry.part.ports.map(port => (
                                        <Chip key={port.id} label={`${port.name} (${port.spec})`} color="bg-blue-50 text-blue-700" />
                                    ))}
                                </div>
                            </div>
                        )}
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

const EnclosureModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    spec: EnclosureSpec | null;
    isGenerating: boolean;
}> = ({ isOpen, onClose, spec, isGenerating }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-600">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">Enclosure Lab (Text-to-CAD)</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-[#F8FAFC]">
                    {isGenerating ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-4">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                            <p className="text-gray-400 font-medium">Synthesizing CAD Geometry...</p>
                        </div>
                    ) : spec ? (
                        <div className="space-y-6">
                            {spec.renderUrl && (
                                <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">
                                    <img src={spec.renderUrl} alt="CAD Render" className="w-full h-auto" />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="p-4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Material</label>
                                    <p className="text-sm font-medium">{spec.material}</p>
                                </Card>
                                <Card className="p-4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Dimensions</label>
                                    <p className="text-sm font-medium">{spec.dimensions}</p>
                                </Card>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-gray-200">
                                <h4 className="font-bold text-sm mb-2">Architect's Description</h4>
                                <p className="text-sm text-slate-600 leading-relaxed">{spec.description}</p>
                            </div>
                            {spec.openSCAD && (
                                <div>
                                    <h4 className="font-bold text-sm mb-2">OpenSCAD Snippet</h4>
                                    <pre className="bg-slate-900 text-indigo-300 p-4 rounded-xl text-xs font-mono overflow-x-auto">
                                        {spec.openSCAD}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-center text-gray-400">Failed to generate enclosure.</p>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => window.open('https://www.shapeways.com/', '_blank')}>Order Print</Button>
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
                        <div className="prose prose-slate max-w-none">
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
  const [pendingAttachment, setPendingAttachment] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [isBomOpen, setIsBomOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  
  const [selectedPart, setSelectedPart] = useState<BOMEntry | null>(null);
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const [isPlanningAssembly, setIsPlanningAssembly] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [enclosureOpen, setEnclosureOpen] = useState(false);
  const [isGeneratingEnclosure, setIsGeneratingEnclosure] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const handleSourcePart = async (entry: BOMEntry) => {
      setSession(prev => ({
          ...prev,
          bom: prev.bom.map(b => b.instanceId === entry.instanceId ? { ...b, sourcing: { ...b.sourcing, loading: true } } : b)
      }));
      try {
          const query = `${entry.part.name} ${entry.part.sku} buy online`; 
          const result = await aiService.findPartSources?.(query);
          if (result) {
             draftingEngine.updatePartSourcing(entry.instanceId, result);
             setSession(draftingEngine.getSession());
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleSourceAll = async () => {
    const partsToSource = session.bom.filter(b => !b.sourcing?.online || b.sourcing.online.length === 0);
    for (const entry of partsToSource) {
      await handleSourcePart(entry);
    }
  };

  const handleGenerateEnclosure = async () => {
    if (!aiService.generateEnclosure || session.bom.length === 0) return;
    setEnclosureOpen(true);
    setIsGeneratingEnclosure(true);
    try {
        const spec = await aiService.generateEnclosure(session.designRequirements, session.bom);
        if (spec) {
            // Update drafting engine (not in current simple engine but we'd add it for production)
            setSession(prev => ({ ...prev, enclosure: spec }));
        }
    } catch (e) { console.error(e); } finally { setIsGeneratingEnclosure(false); }
  };

  const handleGenerateVisual = async () => {
      const currentSession = draftingEngine.getSession();
      if (isVisualizing || currentSession.bom.length === 0) return;
      setIsVisualizing(true);
      try {
          const requirements = currentSession.designRequirements || currentSession.name || "Hardware concept";
          const imageUrl = await aiService.generateProductImage(requirements);
          if (imageUrl) {
              draftingEngine.addGeneratedImage(imageUrl, `Design concept for: ${requirements}`);
              setSession(draftingEngine.getSession());
          }
      } catch (e) { console.error(e); } finally { setIsVisualizing(false); }
  };

  const handleVerifyAudit = async () => {
      if (!aiService.verifyDesign || session.bom.length === 0) return;
      setAuditOpen(true);
      setIsAuditing(true);
      try {
          const res = await aiService.verifyDesign(session.bom, session.designRequirements, session.cachedAuditResult);
          draftingEngine.cacheAuditResult(res.reasoning);
          setSession(draftingEngine.getSession());
      } catch (e) { console.error(e); } finally { setIsAuditing(false); }
  };

  const handlePlanAssembly = async () => {
      if (!aiService.generateAssemblyPlan || session.bom.length === 0) return;
      setAssemblyOpen(true);
      setIsPlanningAssembly(true);
      try {
          const plan = await aiService.generateAssemblyPlan(session.bom, session.cachedAssemblyPlan);
          if (plan) {
              draftingEngine.cacheAssemblyPlan(plan);
              setSession(draftingEngine.getSession());
          }
      } catch (e) { console.error(e); } finally { setIsPlanningAssembly(false); }
  };

  const processArchitectRequest = async (text: string, attachment?: string | null) => {
      setIsThinking(true);
      try {
          const currentSession = draftingEngine.getSession();
          const history = currentSession.messages.map(m => ({
                role: m.role === 'user' ? 'user' as const : 'model' as const,
                parts: [{ text: m.content }]
          }));
          const architectResponse = await aiService.askArchitect(text, history, attachment || undefined);
          const parsed = aiService.parseArchitectResponse(architectResponse);
          
          let stateModified = false;
          parsed.toolCalls.forEach(call => {
            if (call.type === 'initializeDraft') {
                draftingEngine.initialize(call.name, call.reqs);
                stateModified = true;
            } else if (call.type === 'addPart') {
                draftingEngine.addPart(call.partId, call.qty);
                stateModified = true;
            } else if (call.type === 'removePart') {
                draftingEngine.removePart(call.instanceId);
                stateModified = true;
            }
          });
          
          draftingEngine.addMessage({ role: 'assistant', content: parsed.reasoning || architectResponse, timestamp: new Date() });
          if (stateModified) handleGenerateVisual();
          setSession(draftingEngine.getSession());
      } catch (error: any) {
          draftingEngine.addMessage({ role: 'assistant', content: `[SYSTEM ERROR] ${error.message}`, timestamp: new Date() });
          setSession(draftingEngine.getSession());
      } finally { setIsThinking(false); }
  };

  const handleSend = async () => {
    if ((!input.trim() && !pendingAttachment) || isThinking) return;
    draftingEngine.addMessage({ role: 'user', content: input, attachment: pendingAttachment || undefined, timestamp: new Date() });
    setSession(draftingEngine.getSession());
    const tempInput = input;
    setInput('');
    setPendingAttachment(null);
    await processArchitectRequest(tempInput, pendingAttachment);
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#F3F4F6] text-[#1F1F1F] overflow-hidden font-sans relative flex-col md:flex-row">
      <EnclosureModal isOpen={enclosureOpen} onClose={() => setEnclosureOpen(false)} spec={null} isGenerating={isGeneratingEnclosure} />
      <AssemblyModal 
        isOpen={assemblyOpen} 
        onClose={() => setAssemblyOpen(false)} 
        plan={session.cachedAssemblyPlan || null} 
        isRunning={isPlanningAssembly} 
        isDirty={session.cacheIsDirty}
        onLaunchAR={() => setArOpen(true)} 
        onRefresh={handlePlanAssembly}
      />
      <AuditModal 
        isOpen={auditOpen} 
        onClose={() => setAuditOpen(false)} 
        result={session.cachedAuditResult || null} 
        isRunning={isAuditing} 
        isDirty={session.cacheIsDirty}
        onRefresh={handleVerifyAudit}
      />
      {arOpen && session.cachedAssemblyPlan && <ARGuideView plan={session.cachedAssemblyPlan} aiService={aiService} onClose={() => setArOpen(false)} />}
      
      {/* Fixed: Used the now-defined PartDetailModal component */}
      <PartDetailModal 
        entry={selectedPart} 
        onClose={() => setSelectedPart(null)} 
        onFabricate={() => {}} 
        onSource={handleSourcePart} 
        onManualSource={() => {}} 
        onLocate={() => {}} 
      />

      {/* Sidebar */}
      <nav className="hidden md:flex w-[88px] border-r border-gray-200 bg-white flex-col items-center py-6 gap-6 z-20 shadow-sm">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">B</div>
        <div className="flex flex-col gap-4 flex-1 items-center">
            <button onClick={() => draftingEngine.createNewProject()} className="w-12 h-12 flex items-center justify-center text-indigo-600 bg-indigo-50 rounded-2xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg></button>
            <button onClick={handleGenerateEnclosure} title="Enclosure Lab" className="w-12 h-12 flex items-center justify-center text-yellow-600 bg-yellow-50 rounded-2xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg></button>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 flex flex-col border-r border-gray-200 bg-white">
          <header className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <h1 className="font-medium text-xl tracking-tight text-slate-900">{session.name || "Untitled Build"}</h1>
            <div className="flex gap-2 items-center">
                {session.cacheIsDirty && session.bom.length > 0 && <Chip label="STALE CACHE" color="bg-red-50 text-red-500 font-bold border-red-100" />}
                <button onClick={() => setIsBomOpen(!isBomOpen)} className="p-2"><svg className={`w-5 h-5 ${isBomOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
            </div>
          </header>
          <div className="bg-[#F8FAFC] border-b border-gray-200 p-4 h-[33%]">
             <ChiltonVisualizer images={session.generatedImages} onGenerate={handleGenerateVisual} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[24px] px-6 py-4 ${m.role === 'user' ? 'bg-slate-900 text-white shadow-xl' : 'bg-[#F0F4F9] text-slate-800'}`}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isThinking && <div className="flex justify-start"><div className="bg-[#F0F4F9] rounded-[24px] px-6 py-4 animate-pulse text-gray-400 italic">Gemini is thinking...</div></div>}
            <div ref={chatEndRef} />
          </div>
          <footer className="p-6 border-t border-gray-100 bg-white">
            <div className="relative">
                <textarea 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Instruct your hardware architect..." 
                    className="w-full pl-6 pr-24 py-4 bg-[#F0F4F9] border-none rounded-[32px] text-sm resize-none outline-none" 
                    rows={1} 
                />
                <button onClick={handleSend} className="absolute right-2 top-2 w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>
            </div>
          </footer>
        </section>

        {isBomOpen && (
          <section className="w-[450px] flex flex-col bg-white border-l border-gray-200">
            <header className="px-6 py-5 border-b border-gray-200 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-sm uppercase tracking-widest text-slate-800">Bill of Materials</h2>
                <div className="text-xl font-mono font-bold">${session.bom.reduce((acc, curr) => acc + (curr.part.price * curr.quantity), 0).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 text-[10px] h-8" onClick={handleSourceAll}>Sync Inventory</Button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#F8FAFC]">
              {session.bom.map(entry => (
                <Card key={entry.instanceId} className="p-4 hover:shadow-md cursor-pointer transition-all" onClick={() => setSelectedPart(entry)}>
                  <div className="flex justify-between items-center">
                    <div>
                        <div className="font-bold text-sm">{entry.part.name}</div>
                        <div className="flex gap-2 items-center">
                            <span className="text-[10px] text-gray-400 font-mono">{entry.part.sku}</span>
                            {entry.sourcing?.online && <span className="text-[9px] bg-green-50 text-green-600 px-1 rounded">Sourced</span>}
                        </div>
                    </div>
                    <div className="text-xs font-bold text-slate-900">${(entry.part.price * entry.quantity).toLocaleString()}</div>
                  </div>
                </Card>
              ))}
              {session.bom.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-8 py-20"><svg className="w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><p className="text-sm">Architect hasn't added components yet.</p></div>}
            </div>
            <footer className="p-6 border-t border-gray-200 grid grid-cols-2 gap-3 bg-[#FDFDFD]">
              <Button onClick={handleVerifyAudit} className={`text-white transition-all ${session.cacheIsDirty ? 'bg-indigo-600 shadow-lg scale-[1.02]' : 'bg-slate-900 opacity-60'}`}>
                {session.cachedAuditResult && !session.cacheIsDirty ? 'View Audit' : 'Verify Design'}
              </Button>
              <Button onClick={handlePlanAssembly} className={`text-white transition-all ${session.cacheIsDirty ? 'bg-blue-600 shadow-lg scale-[1.02]' : 'bg-blue-800 opacity-60'}`}>
                {session.cachedAssemblyPlan && !session.cacheIsDirty ? 'View Plan' : 'Plan Assembly'}
              </Button>
            </footer>
          </section>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => (<ErrorBoundary><AppContent /></ErrorBoundary>);
export default App;
