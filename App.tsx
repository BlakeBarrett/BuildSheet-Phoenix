import React, { Component, useState, useRef, useEffect, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { DraftingSession, UserMessage, User, BOMEntry, Part, AssemblyPlan } from './types.ts';
import { Button, Chip, Card, GoogleSignInButton } from './components/Material3UI.tsx';
import { ChiltonVisualizer } from './components/ChiltonVisualizer.tsx';
import { useService } from './contexts/ServiceContext.tsx';

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

const AssemblyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    plan: AssemblyPlan | null;
    isRunning: boolean;
}> = ({ isOpen, onClose, plan, isRunning }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRunning ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                            {isRunning ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"><path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Robotic Assembly Planner</h3>
                            <p className="text-[10px] text-gray-400 font-mono uppercase">Powered by Gemini Robotics-ER 1.5</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 bg-white font-sans text-sm leading-relaxed text-slate-600">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
                            <p className="text-gray-400 font-medium animate-pulse">Calculating kinematics & collisions...</p>
                        </div>
                    ) : plan ? (
                        <div className="space-y-6">
                            {/* Summary Metrics */}
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

                            {/* End Effectors */}
                            <div>
                                <h4 className="font-bold text-xs uppercase text-slate-800 mb-3">Required End-Effectors</h4>
                                <div className="flex gap-2 flex-wrap">
                                    {plan.requiredEndEffectors.map((tool, i) => (
                                        <span key={i} className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
                                            🔧 {tool}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Steps */}
                            <div>
                                <h4 className="font-bold text-xs uppercase text-slate-800 mb-3">Assembly Sequence</h4>
                                <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-0 before:w-0.5 before:bg-gray-100">
                                    {plan.steps.map((step, i) => (
                                        <div key={i} className="relative pl-10">
                                            <div className="absolute left-0 top-0 w-8 h-8 bg-white border-2 border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs shadow-sm z-10">
                                                {step.stepNumber}
                                            </div>
                                            <div className="bg-[#F8FAFC] border border-gray-100 rounded-xl p-4">
                                                <div className="font-medium text-slate-800 mb-1">{step.description}</div>
                                                <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-wide mt-2">
                                                    <span>Using: {step.requiredTool}</span>
                                                    <span>⏱ {step.estimatedTime}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            {plan.notes && (
                                <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl text-sm text-yellow-800">
                                    <strong>Engineer's Notes:</strong> {plan.notes}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-gray-400">No plan generated.</div>
                    )}
                </div>
                {!isRunning && (
                    <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end">
                        <Button onClick={onClose} variant="primary">Done</Button>
                    </div>
                )}
             </div>
        </div>
    );
};

const PartDetailModal: React.FC<{
  entry: BOMEntry | null;
  onClose: () => void;
  onFabricate: (part: any) => void;
  onSource: (entry: BOMEntry) => void;
  onManualSource: (id: string, url: string) => void;
  onLocate: (entry: BOMEntry) => void;
}> = ({ entry, onClose, onFabricate, onSource, onManualSource, onLocate }) => {
  const [manualUrl, setManualUrl] = useState('');

  if (!entry) return null;
  const { part } = entry;

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{part.name}</h3>
            <div className="text-xs text-gray-500 font-mono">{part.sku}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
           <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Specifications</h4>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-slate-700">
                  <p>{part.description}</p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                      <Chip label={part.category} />
                      <Chip label={part.brand} color="bg-indigo-50 text-indigo-700" />
                  </div>
              </div>
           </div>

           <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ports & Interfaces</h4>
              {part.ports.length > 0 ? (
                  <div className="space-y-2">
                      {part.ports.map(p => (
                          <div key={p.id} className="flex justify-between items-center text-sm p-2 border border-gray-100 rounded-lg">
                              <span className="font-medium text-slate-700">{p.name}</span>
                              <div className="flex gap-2">
                                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{p.type}</span>
                                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{p.gender}</span>
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <p className="text-sm text-gray-400 italic">No ports defined.</p>
              )}
           </div>

           <div>
               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Actions</h4>
               <div className="grid grid-cols-2 gap-3">
                   <Button variant="secondary" onClick={() => onSource(entry)}>Find Online</Button>
                   <Button variant="secondary" onClick={() => onLocate(entry)}>Find Local</Button>
                   <Button variant="tonal" onClick={() => onFabricate(part)}>Fabrication Brief</Button>
               </div>
           </div>
           
           <div className="pt-4 border-t border-gray-100">
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Manual Source URL</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={manualUrl} 
                        onChange={e => setManualUrl(e.target.value)} 
                        placeholder="https://..."
                        className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                    <Button onClick={() => onManualSource(entry.instanceId, manualUrl)} className="h-auto py-2">Save</Button>
                </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const PartPickerModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    onAdd: (id: string) => void;
    engine: any 
}> = ({ isOpen, onClose, onAdd, engine }) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            setResults(engine.searchRegistry(''));
            setQuery('');
        }
    }, [isOpen, engine]);

    const handleSearch = (q: string) => {
        setQuery(q);
        setResults(engine.searchRegistry(q));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <h3 className="text-lg font-bold text-slate-800">{t('bom.add')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>
                </div>
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <input 
                        type="text" 
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder={t('bom.search')}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm"
                        autoFocus
                    />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {results.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">{t('bom.no_results')}</div>
                    ) : (
                        <div className="space-y-1">
                            {results.map(part => (
                                <button 
                                    key={part.id}
                                    onClick={() => { onAdd(part.id); onClose(); }}
                                    className="w-full text-left p-3 hover:bg-indigo-50 rounded-xl group transition-colors border border-transparent hover:border-indigo-100"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-sm text-slate-800 group-hover:text-indigo-700">{part.name}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{part.sku}</div>
                                        </div>
                                        <div className="text-xs font-bold text-slate-900">${part.price}</div>
                                    </div>
                                    <div className="mt-1 flex gap-2">
                                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded uppercase tracking-wider">{part.category}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};

const AuditModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    result: string | null;
    isRunning: boolean;
    pendingFixes: any[];
    onApply: () => void;
    onDecline: () => void;
}> = ({ isOpen, onClose, result, isRunning, pendingFixes, onApply, onDecline }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRunning ? 'bg-indigo-50 text-indigo-600' : 'bg-green-50 text-green-600'}`}>
                            {isRunning ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">{t('audit.title')}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 bg-white font-sans text-sm leading-relaxed text-slate-600">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-ping"></div>
                            <p className="text-gray-400 font-medium animate-pulse">{t('audit.running')}</p>
                        </div>
                    ) : (
                        <div className="prose prose-sm max-w-none prose-indigo prose-headings:font-bold prose-headings:text-slate-800">
                            <ReactMarkdown>{result || "No issues found."}</ReactMarkdown>
                        </div>
                    )}
                </div>

                {!isRunning && pendingFixes.length > 0 && (
                    <div className="p-4 border-t border-gray-100 bg-indigo-50/50 flex flex-col gap-3">
                         <div className="flex items-start gap-3 p-3 bg-white border border-indigo-100 rounded-xl shadow-sm">
                             <div className="text-indigo-600 mt-0.5">
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                             </div>
                             <div>
                                 <h4 className="font-bold text-sm text-slate-800">Auto-Fix Available</h4>
                                 <p className="text-xs text-gray-500">Gemini has proposed {pendingFixes.length} modification{pendingFixes.length !== 1 ? 's' : ''} to resolve conflicts.</p>
                             </div>
                         </div>
                         <div className="flex gap-3 justify-end">
                             <Button onClick={onDecline} variant="ghost" className="text-gray-500 hover:text-slate-800">Ignore</Button>
                             <Button onClick={onApply} variant="primary" className="bg-indigo-600 hover:bg-indigo-700">Apply Fixes</Button>
                         </div>
                    </div>
                )}
             </div>
        </div>
    );
};

const FabricationModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    result: string | null;
    isRunning: boolean;
    partName: string;
}> = ({ isOpen, onClose, result, isRunning, partName }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                     <div>
                        <h3 className="text-lg font-bold text-slate-800">{t('fab.title')}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-1">{partName}</p>
                     </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 bg-[#F8FAFC]">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-6">
                            <div className="relative w-16 h-16">
                                 <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-100 rounded-full"></div>
                                 <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-indigo-600 font-medium text-sm animate-pulse">Generating Specifications...</p>
                        </div>
                    ) : (
                         <article className="prose prose-sm max-w-none prose-slate prose-headings:text-slate-900 prose-img:rounded-xl prose-img:shadow-lg prose-img:border prose-img:border-gray-200">
                             <ReactMarkdown>{result || ""}</ReactMarkdown>
                         </article>
                    )}
                </div>

                {!isRunning && (
                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => window.open('https://www.pcbway.com/', '_blank')}>
                            {t('fab.pcbway')}
                        </Button>
                        <Button variant="secondary" onClick={() => window.open('https://sendcutsend.com/', '_blank')}>
                            {t('fab.scs')}
                        </Button>
                        <Button variant="primary" onClick={onClose}>Done</Button>
                    </div>
                )}
             </div>
        </div>
    );
};

const ShareModal: React.FC<{ isOpen: boolean; onClose: () => void; session: DraftingSession; engine: any }> = ({ isOpen, onClose, session, engine }) => {
    const [slugInput, setSlugInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen && session.shareSlug) {
            setSlugInput(session.shareSlug);
        } else {
            setSlugInput('');
        }
        setCopied(false);
        setError(null);
    }, [isOpen, session]);

    const handleSaveSlug = () => {
        if (!slugInput.trim()) return;
        
        const result = engine.setShareSlug(slugInput.trim());
        if (result.success) {
            setSlugInput(engine.getSession().shareSlug || slugInput); // Update with standardized slug
            setError(null);
        } else {
            setError(result.message || "Failed to set slug");
        }
    };

    const handleCopy = () => {
        const url = `${window.location.origin}/sheet/${session.shareSlug || slugInput}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    const fullUrl = `${window.location.origin}/sheet/${session.shareSlug || slugInput || '...'}`;
    const hasActiveSlug = !!session.shareSlug;

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <h3 className="text-lg font-bold text-slate-800">Share Project</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-500">Create a custom short-link for your build sheet.</p>
                    
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Custom Slug</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={slugInput}
                                onChange={(e) => { setSlugInput(e.target.value); setError(null); }}
                                placeholder="e.g. gaming-pc-v1"
                                className={`flex-1 text-sm px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 transition-all ${error ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'}`}
                                disabled={hasActiveSlug && slugInput === session.shareSlug}
                            />
                            {!hasActiveSlug && (
                                <Button onClick={handleSaveSlug} variant="primary" className="h-auto">Reserve</Button>
                            )}
                        </div>
                        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    </div>

                    {hasActiveSlug && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                            <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Your Link</label>
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-xs font-mono text-indigo-900 truncate">{fullUrl}</code>
                                <button 
                                    onClick={handleCopy}
                                    className="text-indigo-600 hover:text-indigo-800 p-1.5 hover:bg-indigo-100 rounded-lg transition-colors"
                                    title="Copy to Clipboard"
                                >
                                    {copied ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end">
                    <Button onClick={onClose} variant="secondary">Done</Button>
                </div>
             </div>
        </div>
    );
};

const ProjectManager: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    onLoad: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    onRename: (id: string, name: string) => void;
    activeId: string;
    engine: any;
    currentUser: User | null;
}> = ({ isOpen, onClose, onLoad, onNew, onDelete, onRename, activeId, engine, currentUser }) => {
    const [projects, setProjects] = useState<any[]>([]);
    const { t, i18n } = useTranslation();
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setProjects(engine.getProjectList());
        }
    }, [isOpen, engine]);

    const handleRenameClick = (e: React.MouseEvent, id: string, currentName: string) => {
        e.stopPropagation();
        const newName = window.prompt(t('app.rename') + ":", currentName);
        if (newName && newName.trim() !== "") {
            onRename(id, newName.trim());
            setProjects(engine.getProjectList()); // Refresh list
        }
    };

    const handleExport = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        const json = engine.exportProject(id);
        if (json) {
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `buildsheet-${name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                const newId = engine.importProject(content);
                if (newId) {
                    setProjects(engine.getProjectList());
                    onLoad(newId); // Load the imported project
                } else {
                    alert("Import failed. Invalid file format.");
                }
            }
        };
        reader.readAsText(file);
        // Reset input value to allow re-importing same file if needed
        e.target.value = '';
    };

    if (!isOpen) return null;

    return (
        <div className="absolute left-0 md:left-[88px] top-4 bottom-4 w-full md:w-80 bg-white border border-gray-200 z-50 shadow-2xl rounded-r-2xl md:rounded-2xl animate-in slide-in-from-left duration-200 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                <h2 className="font-medium text-slate-800 text-lg tracking-tight">{t('app.projects')}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close Projects">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <button 
                        onClick={onNew}
                        className="col-span-1 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium text-sm hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-1"
                        aria-label={t('app.newProject')}
                    >
                        <span className="text-xl leading-none font-light">+</span> 
                        <span className="text-xs">{t('app.newProject')}</span>
                    </button>
                    
                    <button 
                        onClick={handleImportClick}
                        className="col-span-1 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium text-sm hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-1"
                        aria-label={t('app.import')}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        <span className="text-xs">{t('app.import')}</span>
                    </button>
                    <input 
                        type="file" 
                        ref={importInputRef} 
                        onChange={handleFileChange} 
                        accept=".json" 
                        className="hidden" 
                    />
                </div>

                {projects.map(p => (
                    <div 
                        key={p.id} 
                        className={`group relative p-4 rounded-xl text-left border transition-all cursor-pointer ${
                            p.id === activeId 
                            ? 'bg-indigo-50 border-indigo-200 shadow-sm ring-1 ring-indigo-100' 
                            : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md'
                        }`}
                        onClick={() => onLoad(p.id)}
                    >
                        <div className="pr-16">
                            <div className="font-bold text-sm text-slate-800 truncate">{p.name || 'Untitled'}</div>
                            <div className="text-[10px] text-gray-400 font-mono mt-1 flex justify-between items-center">
                                <span>{new Date(p.lastModified).toLocaleDateString(i18n.language)}</span>
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{p.preview}</span>
                            </div>
                        </div>
                        
                        <div className="absolute top-3 right-2 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur rounded p-0.5 shadow-sm md:shadow-none md:bg-transparent">
                             <button 
                                onClick={(e) => handleExport(e, p.id, p.name)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                title={t('app.export')}
                                aria-label={t('app.export')}
                             >
                                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                             </button>
                             <button 
                                onClick={(e) => handleRenameClick(e, p.id, p.name)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                title={t('app.rename')}
                                aria-label={t('app.rename')}
                             >
                                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                             </button>
                             {p.id !== activeId && (
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); onDelete(p.id); setProjects(engine.getProjectList()); }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                    title={t('app.delete')}
                                    aria-label={t('app.delete')}
                                 >
                                     <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                 </button>
                             )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobile/Drawer Auth Section */}
            <div className="p-4 bg-gray-50 border-t border-gray-200">
                {currentUser ? (
                    <div className="flex items-center gap-3">
                        <img src={currentUser.avatar} alt="Avatar" className="w-10 h-10 rounded-full border border-gray-200 shadow-sm" />
                        <div className="flex-1 overflow-hidden">
                            <div className="font-bold text-sm text-slate-800 truncate">{currentUser.name}</div>
                            <div className="text-[10px] text-gray-500 truncate">{currentUser.email}</div>
                        </div>
                        <button 
                            onClick={() => UserService.logout()}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('app.logOut')}
                            aria-label={t('app.logOut')}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                        </button>
                    </div>
                ) : (
                    <GoogleSignInButton onClick={() => UserService.login()} label={t('app.signInGoogle')} />
                )}
            </div>
            {/* Language Selector in Drawer */}
            <div className="p-4 bg-white border-t border-gray-200">
               <label className="text-[10px] uppercase font-bold text-gray-400 mb-2 block">{t('lang.select')}</label>
               <div className="flex gap-2 flex-wrap">
                   {['en', 'es', 'pt', 'de', 'fr', 'hi'].map(lang => (
                       <button
                           key={lang}
                           onClick={() => i18n.changeLanguage(lang)}
                           className={`px-2 py-1 text-xs rounded border transition-colors ${i18n.language.startsWith(lang) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                       >
                           {lang.toUpperCase()}
                       </button>
                   ))}
               </div>
            </div>
        </div>
    );
};

const AppContent: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { service: aiService, status: aiStatus, error: serviceError } = useService();
  const [draftingEngine] = useState(() => getDraftingEngine());
  
  const [session, setSession] = useState<DraftingSession>(draftingEngine.getSession());
  const [input, setInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // UI State
  const [showLogs, setShowLogs] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isBomOpen, setIsBomOpen] = useState(true);
  
  // Modals
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [pendingFixes, setPendingFixes] = useState<any[]>([]);
  
  const [selectedPart, setSelectedPart] = useState<BOMEntry | null>(null);
  const [fabModalOpen, setFabModalOpen] = useState(false);
  const [fabResult, setFabResult] = useState<string | null>(null);
  const [isFabricating, setIsFabricating] = useState(false);
  const [fabPartName, setFabPartName] = useState('');

  // Assembly Modal State
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const [assemblyPlan, setAssemblyPlan] = useState<AssemblyPlan | null>(null);
  const [isPlanningAssembly, setIsPlanningAssembly] = useState(false);

  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  
  // Mobile UI State
  const [mobileView, setMobileView] = useState<'chat' | 'visuals'>('chat');
  
  // Visualizer State
  const [isVisualizing, setIsVisualizing] = useState(false);
  
  // Resizable Visualizer State
  const [visualizerHeight, setVisualizerHeight] = useState(33); // Start at 33% (approx 2:1 ratio)
  const leftPaneRef = useRef<HTMLElement>(null);
  const isResizingRef = useRef(false);

  // Resizable Right Pane State
  const [rightPaneWidth, setRightPaneWidth] = useState(450);
  const isResizingRightRef = useRef(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  // Update HTML lang attribute
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // Window Resize Listener for Desktop Check
  useEffect(() => {
      const handleResize = () => setIsDesktop(window.innerWidth >= 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Routing Logic for Shares
  useEffect(() => {
      const path = window.location.pathname;
      if (path.startsWith('/sheet/')) {
          const slug = path.split('/sheet/')[1];
          if (slug) {
              const projectId = draftingEngine.findProjectBySlug(slug);
              if (projectId) {
                  if (draftingEngine.loadProject(projectId)) {
                      setSession(draftingEngine.getSession());
                      // Cleanup URL visually
                      window.history.replaceState({}, '', '/sheet/' + slug);
                  }
              }
          }
      }
  }, [draftingEngine]);

  const startResizing = (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !leftPaneRef.current) return;
      
      const paneRect = leftPaneRef.current.getBoundingClientRect();
      const headerOffset = 76;
      const relativeY = e.clientY - paneRect.top - headerOffset;
      
      let percentage = (relativeY / (paneRect.height - headerOffset)) * 100;
      percentage = Math.min(50, Math.max(20, percentage)); // Clamp between 20% and 50%
      setVisualizerHeight(percentage);
  };

  const stopResizing = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
  };

  // Right Pane Resize Logic
  const startResizingRight = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingRightRef.current = true;
      document.addEventListener('mousemove', handleMouseMoveRight);
      document.addEventListener('mouseup', stopResizingRight);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  };

  const handleMouseMoveRight = (e: MouseEvent) => {
      if (!isResizingRightRef.current) return;
      
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * 0.5; // Max 50%
      const minWidth = 300; // Min 300px

      if (newWidth < minWidth) setRightPaneWidth(minWidth);
      else if (newWidth > maxWidth) setRightPaneWidth(maxWidth);
      else setRightPaneWidth(newWidth);
  };

  const stopResizingRight = () => {
      isResizingRightRef.current = false;
      document.removeEventListener('mousemove', handleMouseMoveRight);
      document.removeEventListener('mouseup', stopResizingRight);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = UserService.onUserChange((user) => {
      setCurrentUser(user);
      if (user) draftingEngine.updateOwner(user.id);
    });
    return unsubscribe;
  }, [draftingEngine]);

  useEffect(() => { 
      if (mobileView === 'chat') {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
      }
  }, [session.messages.length, mobileView, isThinking]);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        if (event.target?.result) {
            setPendingAttachment(event.target.result as string);
        }
    };
    reader.readAsDataURL(file);
  };

  const cleanBase64ForAPI = (dataUrl: string): { mimeType: string, data: string } | null => {
    try {
        const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return null;
        return { mimeType: matches[1], data: matches[2] };
    } catch (e) { return null; }
  };

  const handleGenerateVisual = async (architectReasoning?: string, referenceImage?: string) => {
    const currentSession = draftingEngine.getSession();
    if (currentSession.bom.length === 0 && !currentSession.designRequirements) return;
    if (isVisualizing) return;

    setIsVisualizing(true);
    
    if (window.innerWidth < 768) {
        setMobileView('visuals');
    }

    try {
        const partsList = currentSession.bom.map(b => `${b.quantity}x ${b.part.name}`).join(', ');
        let prompt = `Product Design Sketch.`;
        if (currentSession.designRequirements) prompt += ` Context: ${currentSession.designRequirements}.`;
        if (partsList) prompt += ` Visible Components: ${partsList}.`;
        if (architectReasoning) prompt += ` Design Notes: ${architectReasoning.slice(0, 150)}...`;
        
        const imageUrl = await aiService.generateProductImage(prompt, referenceImage);
        if (imageUrl) {
            draftingEngine.addGeneratedImage(imageUrl, prompt);
            setSession(draftingEngine.getSession());
        }
    } catch (e) {
        console.error("Visual generation failed", e);
    } finally {
        setIsVisualizing(false);
    }
  };

  // Define handleSourcePart outside to be used by both processArchitectRequest and UI
  const handleSourcePart = async (entry: BOMEntry) => {
      const setPartLoading = (loading: boolean) => {
          setSession(prev => ({
              ...prev,
              bom: prev.bom.map(b => b.instanceId === entry.instanceId ? { ...b, sourcing: { ...b.sourcing, loading } } : b)
          }));
      };

      setPartLoading(true);

      try {
          const query = entry.part.sku.startsWith('DRAFT-') 
             ? `${entry.part.name} ${entry.part.description} hardware` 
             : `${entry.part.name} ${entry.part.sku}`; 

          const result = await aiService.findPartSources?.(query);
          if (result) {
             draftingEngine.updatePartSourcing(entry.instanceId, result);
             setSession(draftingEngine.getSession());
          } else {
             setPartLoading(false); 
          }
      } catch (e) {
          console.error("Sourcing failed", e);
          setPartLoading(false); 
      }
  };

  const handleLocatePart = async (entry: BOMEntry) => {
      if (!aiService.findLocalSuppliers) return;
      
      const setPartLoading = (loading: boolean) => {
          setSession(prev => ({
              ...prev,
              bom: prev.bom.map(b => b.instanceId === entry.instanceId ? { ...b, sourcing: { ...b.sourcing, loading } } : b)
          }));
      };

      setPartLoading(true);

      try {
          // In a real app we'd ask for permission, here we simulate or use IP based default
          // const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
          const query = entry.part.name;
          const result = await aiService.findLocalSuppliers(query);
          if (result) {
              draftingEngine.updatePartLocalSuppliers(entry.instanceId, result);
              setSession(draftingEngine.getSession());
          } else {
              setPartLoading(false);
          }
      } catch (e) {
          console.error("Map lookup failed", e);
          setPartLoading(false);
      }
  };

  const handleExportSheets = () => {
      // Simulate Google Sheets CSV Export
      const bom = session.bom;
      if (bom.length === 0) return;

      const headers = ['Part Name', 'SKU', 'Quantity', 'Unit Price', 'Total Cost', 'Category', 'Sourcing'];
      const rows = bom.map(b => [
          `"${b.part.name}"`,
          `"${b.part.sku}"`,
          b.quantity,
          b.part.price,
          (b.part.price * b.quantity).toFixed(2),
          `"${b.part.category}"`,
          `"${b.sourcing?.online?.[0]?.url || b.sourcing?.manualUrl || ''}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
          + headers.join(",") + "\n" 
          + rows.map(e => e.join(",")).join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `buildsheet_export_${session.slug}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handlePlanAssembly = async () => {
      if (!aiService.generateAssemblyPlan || session.bom.length === 0) return;
      
      setAssemblyOpen(true);
      setIsPlanningAssembly(true);
      setAssemblyPlan(null);

      try {
          const plan = await aiService.generateAssemblyPlan(session.bom);
          setAssemblyPlan(plan);
      } catch (e) {
          console.error("Planning failed", e);
      } finally {
          setIsPlanningAssembly(false);
      }
  };

  const processArchitectRequest = async (text: string, attachment?: string | null) => {
      setIsThinking(true);
      try {
          const currentSession = draftingEngine.getSession();
          const allMessages = currentSession.messages;
          const historyMessages = allMessages; 
          
          const history = historyMessages.filter(m => !m.content.startsWith('[SYSTEM ALERT]') && !m.content.startsWith('[SYSTEM ERROR]')).map(m => {
            const parts: any[] = [{ text: m.content }];
            if (m.attachment) {
                const clean = cleanBase64ForAPI(m.attachment);
                if (clean) {
                    parts.push({ inlineData: { mimeType: clean.mimeType, data: clean.data }});
                }
            }
            return {
                role: m.role === 'user' ? 'user' as const : 'model' as const,
                parts
            };
          });

          const architectResponse = await aiService.askArchitect(text, history, attachment || undefined);
          const parsed = aiService.parseArchitectResponse(architectResponse);

          const addedParts: BOMEntry[] = [];

          parsed.toolCalls.forEach(call => {
            if (call.type === 'initializeDraft') {
              draftingEngine.initialize(call.name, call.reqs);
            } else if (call.type === 'addPart') {
              const res = draftingEngine.addPart(call.partId, call.qty);
              if (res.entry) addedParts.push(res.entry);
            } else if (call.type === 'removePart') {
              draftingEngine.removePart(call.instanceId);
            }
          });

          draftingEngine.addMessage({ 
            role: 'assistant', 
            content: parsed.reasoning || architectResponse, 
            timestamp: new Date() 
          });

          setSession(draftingEngine.getSession());
          
          addedParts.forEach(partEntry => {
              handleSourcePart(partEntry);
          });
          
          handleGenerateVisual(parsed.reasoning, attachment || undefined);

      } catch (error: any) {
          console.error(error);
          draftingEngine.addMessage({ 
            role: 'assistant', 
            content: `[SYSTEM ERROR] ${error.message || "Unknown error occurred during processing."}`, 
            timestamp: new Date() 
          });
          setSession(draftingEngine.getSession());
      } finally {
          setIsThinking(false);
      }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    const attachmentToSend = pendingAttachment;
    
    if ((!textToSend.trim() && !attachmentToSend) || isThinking) return;

    const userMsg: UserMessage = { 
        role: 'user', 
        content: textToSend, 
        attachment: attachmentToSend || undefined,
        timestamp: new Date() 
    };
    
    draftingEngine.addMessage(userMsg);
    setSession(draftingEngine.getSession());
    
    setInput('');
    setPendingAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    await processArchitectRequest(textToSend, attachmentToSend);
  };

  const handleRetry = async () => {
      const currentMsgs = draftingEngine.getSession().messages;
      // We look for the last human message if the current last is an error
      const lastMsg = currentMsgs[currentMsgs.length - 1];
      
      const isError = lastMsg?.role === 'assistant' && (
          lastMsg.content.includes('[SYSTEM ALERT]') || 
          lastMsg.content === "Gemini provided no output." ||
          lastMsg.content.startsWith("Error:") ||
          lastMsg.content.startsWith("[SYSTEM ERROR]")
      );

      if (isError) {
          draftingEngine.removeLastMessage();
          const freshSession = draftingEngine.getSession();
          const userMsg = freshSession.messages[freshSession.messages.length - 1];
          setSession(freshSession);
          if (userMsg && userMsg.role === 'user') {
              await processArchitectRequest(userMsg.content, userMsg.attachment || null);
          }
      }
  };

  const handleLoadProject = (id: string) => {
      if (draftingEngine.loadProject(id)) {
          setSession(draftingEngine.getSession());
          setShowProjects(false);
          setMobileView('chat');
      }
  };

  const handleNewProject = () => {
      draftingEngine.createNewProject();
      setSession(draftingEngine.getSession());
      setShowProjects(false);
      setMobileView('chat');
  };

  const handleDeleteProject = (id: string) => {
      draftingEngine.deleteProject(id);
      setSession(draftingEngine.getSession());
  };

  const handleRenameProject = (id: string, newName: string) => {
      draftingEngine.renameProject(id, newName);
      setSession(draftingEngine.getSession());
  };

  const handleVerifyDesign = async () => {
      if (!aiService.verifyDesign || session.bom.length === 0) return;
      setAuditOpen(true);
      setIsAuditing(true);
      setAuditResult(null);
      setPendingFixes([]); 

      try {
          const response: any = await aiService.verifyDesign(session.bom, session.designRequirements);
          setAuditResult(response.reasoning);
          if (response.toolCalls && response.toolCalls.length > 0) {
              setPendingFixes(response.toolCalls);
          }
      } catch (e) {
          setAuditResult("Audit failed due to connection error.");
      } finally {
          setIsAuditing(false);
      }
  };

  const applyPendingFixes = () => {
      if (pendingFixes.length === 0) {
          setAuditOpen(false);
          return;
      }

      const addedParts: BOMEntry[] = [];
      let designChanged = false;

      pendingFixes.forEach(call => {
          if (call.type === 'addPart') {
              const res = draftingEngine.addPart(call.partId, call.qty);
              if (res.entry) addedParts.push(res.entry);
              designChanged = true;
          } else if (call.type === 'removePart') {
              draftingEngine.removePart(call.instanceId);
              designChanged = true;
          }
      });

      setSession(draftingEngine.getSession());
      addedParts.forEach(partEntry => {
          handleSourcePart(partEntry);
      });

      if (designChanged) {
         handleGenerateVisual("Applied system integrity patches automatically.", undefined);
      }

      setPendingFixes([]);
      setAuditOpen(false);
  };

  const declineFixes = () => {
      setPendingFixes([]);
  };

  const handleFabricate = async (part: any) => {
     if (!aiService.generateFabricationBrief) return;
     if (selectedPart?.fabricationBrief) {
         setFabPartName(part.name);
         setFabResult(selectedPart.fabricationBrief);
         setFabModalOpen(true);
         return;
     }

     setFabPartName(part.name);
     setFabModalOpen(true);
     setIsFabricating(true);
     setFabResult(null);

     try {
         const context = `Design Requirements: ${session.designRequirements}. \nFull BOM Context: ${session.bom.map(b => b.part.name).join(', ')}`;
         const brief = await aiService.generateFabricationBrief(part.name, context);
         setFabResult(brief);
         if (selectedPart) {
             draftingEngine.updatePartFabricationBrief(selectedPart.instanceId, brief);
             setSession(draftingEngine.getSession());
             setSelectedPart(prev => prev ? ({...prev, fabricationBrief: brief}) : null);
         }
     } catch(e) {
         setFabResult("Failed to generate brief.");
     } finally {
         setIsFabricating(false);
     }
  };

  const handleManualSource = (instanceId: string, url: string) => {
      draftingEngine.setPartManualSource(instanceId, url);
      setSession(draftingEngine.getSession());
  };

  const handleAddPart = (partId: string) => {
      const res = draftingEngine.addPart(partId, 1);
      setSession(draftingEngine.getSession());
      if (res.entry) handleSourcePart(res.entry);
  };

  const handleQuantityChange = (instanceId: string, newQty: number) => {
      draftingEngine.updatePartQuantity(instanceId, newQty);
      setSession(draftingEngine.getSession());
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#F3F4F6] text-[#1F1F1F] overflow-hidden font-sans relative flex-col md:flex-row">
      {/* Modals */}
      <AuditModal 
          isOpen={auditOpen} 
          onClose={() => setAuditOpen(false)} 
          result={auditResult}
          isRunning={isAuditing}
          pendingFixes={pendingFixes}
          onApply={applyPendingFixes}
          onDecline={declineFixes}
      />
      <FabricationModal
         isOpen={fabModalOpen}
         onClose={() => setFabModalOpen(false)}
         result={fabResult}
         isRunning={isFabricating}
         partName={fabPartName}
      />
      <AssemblyModal
         isOpen={assemblyOpen}
         onClose={() => setAssemblyOpen(false)}
         plan={assemblyPlan}
         isRunning={isPlanningAssembly}
      />
      <PartDetailModal 
        entry={selectedPart}
        onClose={() => setSelectedPart(null)}
        onFabricate={handleFabricate}
        onSource={handleSourcePart}
        onManualSource={handleManualSource}
        onLocate={handleLocatePart}
      />
      <PartPickerModal 
        isOpen={partPickerOpen}
        onClose={() => setPartPickerOpen(false)}
        onAdd={handleAddPart}
        engine={draftingEngine}
      />
      <ShareModal 
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        session={session}
        engine={draftingEngine}
      />

      {/* Sidebar Navigation */}
      <nav className="hidden md:flex w-[88px] border-r border-gray-200 bg-white flex-col items-center py-6 gap-6 flex-shrink-0 shadow-sm z-20 relative">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-100 ring-4 ring-indigo-50 mb-2">B</div>
        
        <div className="flex flex-col gap-4 flex-1 w-full items-center">
          <button onClick={handleNewProject} className="w-12 h-12 flex items-center justify-center text-indigo-600 bg-indigo-50 rounded-2xl transition-all hover:bg-indigo-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></button>
          <button onClick={() => setShowProjects(!showProjects)} className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${showProjects ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></button>
          <button onClick={() => setShowLogs(!showLogs)} className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${showLogs ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4">
          {currentUser ? (
             <button onClick={() => UserService.logout()} className="relative group">
                <img src={currentUser.avatar} alt="User Avatar" className="w-10 h-10 rounded-full border-2 border-indigo-100 group-hover:border-red-400 transition-colors" />
             </button>
          ) : (
            <button onClick={() => UserService.login()} className="w-10 h-10 rounded-full bg-white border border-gray-300 flex items-center justify-center p-2"><svg className="w-full h-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M23.49,12.27c0-0.79-0.07-1.54-0.19-2.27H12v4.51h6.47c-0.29,1.48-1.14,2.73-2.4,3.58v3h3.86 c2.26-2.09,3.56-5.17,3.56-8.82z"/><path fill="#34A853" d="M12,24c3.24,0,5.95-1.08,7.92-2.91l-3.86-3c-1.08,0.72-2.45,1.16-4.06,1.16c-3.13,0-5.78-2.11-6.73-4.96 H1.29v3.09C3.3,21.3,7.31,24,12,24z"/><path fill="#FBBC05" d="M5.27,14.29c-0.25-0.72-0.38-1.49-0.38-2.29s0.14-1.57,0.38-2.29V6.62H1.29C0.47,8.24,0,10.06,0,12 s0.47,3.76,1.29,5.38L5.27,14.29z"/><path fill="#EA4335" d="M12,4.75c1.77,0,3.35,0.61,4.6,1.8l3.42-3.42C17.95,1.19,15.24,0,12,0C7.31,0,3.3,2.7,1.29,6.62l3.98,3.09 C6.22,6.86,8.87,4.75,12,4.75z"/></svg></button>
          )}
        </div>
      </nav>

      <ProjectManager 
        isOpen={showProjects} 
        onClose={() => setShowProjects(false)}
        onLoad={handleLoadProject}
        onNew={handleNewProject}
        onDelete={handleDeleteProject}
        onRename={handleRenameProject}
        activeId={session.id}
        engine={draftingEngine}
        currentUser={currentUser}
      />

      <main className="flex-1 flex overflow-hidden relative">
        <section ref={leftPaneRef as React.RefObject<HTMLElement>} className={`flex-1 flex flex-col border-r border-gray-200 bg-white transition-all duration-500 ${mobileView === 'visuals' ? 'hidden md:flex' : 'flex'}`}>
          <header className="px-6 py-4 md:px-8 md:py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-medium text-lg md:text-xl tracking-tight text-slate-900">{t('app.title')}</h1>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-medium truncate max-w-[150px]">{session.name || "Untitled"}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">{aiService.name}</p>
                <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'online' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
              </div>
            </div>
            <div className="flex gap-2 text-xs font-mono text-gray-400 items-center">
                <Button onClick={() => setShareModalOpen(true)} variant="ghost" className="hidden md:flex h-8 px-3 text-xs bg-indigo-50">Share</Button>
                <button onClick={() => setIsBomOpen(!isBomOpen)} className="hidden md:flex p-2 text-gray-400 hover:text-indigo-600"><svg className={`w-5 h-5 transform ${isBomOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
                <button onClick={() => setShowProjects(true)} className="md:hidden p-2 -mr-2 text-gray-400"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg></button>
            </div>
          </header>

          <div className="hidden md:block bg-[#F8FAFC] border-b border-gray-200 p-4 relative" style={{ height: `${visualizerHeight}%`, minHeight: '200px' }}>
             <ChiltonVisualizer images={session.generatedImages} onGenerate={() => handleGenerateVisual()} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
          </div>

          <div className="hidden md:flex h-3 w-full cursor-row-resize items-center justify-center hover:bg-indigo-50 -mt-1.5 z-30" onMouseDown={startResizing}><div className="w-16 h-1 rounded-full bg-gray-300"></div></div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-white">
            {session.messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
                <div className="w-16 h-16 bg-white border border-gray-200 rounded-[24px] flex items-center justify-center text-indigo-600 shadow-sm"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg></div>
                <h3 className="text-xl font-medium text-slate-800">{t('welcome.title')}</h3>
                <div className="flex flex-col gap-3 w-full">
                  <button onClick={() => handleSend(t('prompt.votive'))} className="p-4 bg-[#F8FAFC] border border-gray-200 rounded-[20px] hover:border-indigo-300 text-left text-sm font-medium">"{t('prompt.votive')}"</button>
                  <button onClick={() => handleSend(t('prompt.gaming'))} className="p-4 bg-[#F8FAFC] border border-gray-200 rounded-[20px] hover:border-indigo-300 text-left text-sm font-medium">"{t('prompt.gaming')}"</button>
                </div>
              </div>
            )}
            
            {session.messages.map((m, i) => {
              const isError = m.content.startsWith('[SYSTEM ERROR]') || m.content.startsWith('Error:');
              return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-[20px] px-5 py-3.5 border ${m.role === 'user' ? 'bg-slate-900 text-white' : isError ? 'bg-red-50 text-red-900 border-red-200' : 'bg-[#F0F4F9] text-slate-800'}`}>
                  {m.attachment && <div className="mb-3 rounded-xl overflow-hidden"><img src={m.attachment} alt="User attachment" className="max-w-full max-h-64 object-contain" /></div>}
                  <div className="text-[14px] leading-relaxed whitespace-pre-wrap"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  {isError && <div className="mt-3"><button onClick={handleRetry} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-bold">Retry</button></div>}
                </div>
              </div>
            )})}
            {isThinking && <div className="flex justify-start"><div className="bg-white border border-gray-100 rounded-full px-4 py-2 flex gap-3 items-center"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div></div><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('status.thinking')}</span></div></div>}
            <div ref={chatEndRef} />
          </div>

          <footer className="p-4 md:p-6 border-t border-gray-100 bg-white shadow-sm">
            <div className="relative flex flex-col gap-2">
              {pendingAttachment && <div className="relative inline-block self-start"><div className="h-16 w-16 rounded-xl border border-gray-200 overflow-hidden relative shadow-sm"><img src={pendingAttachment} className="w-full h-full object-cover" alt="Preview" /></div><button onClick={() => setPendingAttachment(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">&times;</button></div>}
              <div className="relative w-full">
                  <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={t('input.placeholder')} rows={1} className="w-full pl-6 pr-28 py-4 bg-[#F0F4F9] border-none rounded-[28px] text-sm resize-none min-h-[56px] max-h-[200px]" />
                  <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
                      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                      <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 text-gray-500 hover:text-indigo-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg></button>
                      <button onClick={() => handleSend()} disabled={isThinking || (!input.trim() && !pendingAttachment)} className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>
                  </div>
              </div>
            </div>
          </footer>
        </section>

        <section className={`flex-col bg-white border-l border-gray-200 z-20 relative ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'} ${isBomOpen ? '' : 'md:w-0 md:border-l-0 md:overflow-hidden'}`} style={{ width: isDesktop && isBomOpen ? rightPaneWidth : undefined }}>
          <div className="hidden md:flex absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-50 items-center justify-center" onMouseDown={startResizingRight}><div className="w-1 h-8 rounded-full bg-gray-300" /></div>
          <div className="flex flex-col h-full w-full">
          <header className="px-6 py-4 border-b border-gray-200 flex flex-col gap-2 bg-white sticky top-0 z-10">
            <div className="flex justify-between items-end">
              <div><h2 className="font-medium text-lg tracking-tight uppercase text-slate-800">{t('app.build')}</h2><div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div></div>
              <div className="text-right flex items-center gap-4"><div className="text-[18px] font-mono font-bold text-slate-900 tabular-nums">${draftingEngine.getTotalCost().toLocaleString()}</div><button onClick={handleExportSheets} className="p-2 text-green-600 hover:bg-green-50"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></button></div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#F8FAFC]">
             <button onClick={() => setPartPickerOpen(true)} className="w-full py-3 border border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl text-indigo-600 font-medium text-xs uppercase tracking-wider mb-2">+ {t('bom.add')}</button>
            {session.bom.length === 0 ? <div className="h-full flex flex-col items-center justify-center p-12 opacity-40"><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t('bom.empty')}</p></div> : session.bom.map((entry) => (
                  <div key={entry.instanceId} className={`bg-white border p-4 rounded-[20px] shadow-sm transition-all hover:shadow-md group cursor-default ${entry.part.sku.startsWith('DRAFT-') ? 'border-dashed border-indigo-300 bg-indigo-50/30' : !entry.isCompatible ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}><div className="flex justify-between items-start"><div className="flex-1 cursor-pointer" onClick={() => setSelectedPart(entry)}><h4 className="font-semibold text-sm text-slate-900 leading-snug">{entry.part.name}</h4><div className="text-[10px] text-gray-400 font-mono mt-1">{entry.part.sku}</div></div><div className="text-right flex flex-col items-end"><div className="text-xs font-mono font-bold text-slate-900">${(entry.part.price * entry.quantity).toLocaleString()}</div><button onClick={(e) => { e.stopPropagation(); handleSourcePart(entry); }} className="mt-2 p-1.5 rounded-lg bg-gray-50 hover:bg-indigo-50"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></button></div></div></div>
            ))}
          </div>
          <footer className="p-6 bg-white border-t border-gray-200 grid grid-cols-2 gap-3"><Button onClick={handleVerifyDesign} disabled={session.bom.length === 0} className="py-3.5 text-xs font-bold uppercase tracking-[0.15em] bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2">{isAuditing ? <span>{t('audit.running')}</span> : <span>{t('audit.button')}</span>}</Button><Button onClick={handlePlanAssembly} disabled={session.bom.length === 0} className="py-3.5 text-xs font-bold uppercase tracking-[0.15em] bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2">{isPlanningAssembly ? <span>Robotics-ER...</span> : <span>Plan Assembly</span>}</Button></footer>
          </div>
        </section>
      </main>
    </div>
  );
};

const App: React.FC = () => (<ErrorBoundary><AppContent /></ErrorBoundary>);
export default App;