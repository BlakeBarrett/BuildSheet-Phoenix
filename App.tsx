
import React, { Component, useState, useRef, useEffect, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine, ProjectIndexEntry } from './services/draftingEngine.ts';
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
            <div className="max-w-lg text-center">
                <h1 className="text-2xl font-bold text-[#FFB4AB] mb-4">System Critical Failure</h1>
                <p className="mb-4 text-[#E2E2E2]">The application encountered an unrecoverable error.</p>
                <pre className="bg-black/30 p-4 rounded-xl text-xs font-mono overflow-auto border border-[#FFB4AB]/30 text-left">{this.state.error?.message}</pre>
                <Button onClick={() => window.location.reload()} variant="tonal" className="mt-6" aria-label="Restart Application">Reboot System</Button>
            </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- MODAL COMPONENTS ---

const ProjectNavigator: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    projects: ProjectIndexEntry[];
    currentId: string;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onNewProject: () => void;
}> = ({ isOpen, onClose, projects, currentId, onSelect, onDelete, onNewProject }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute left-0 top-0 bottom-0 w-[350px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
                <header className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 leading-tight">Build History</h3>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">Your Projects</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors" aria-label="Close navigator">&times;</button>
                </header>
                
                <div className="p-4 bg-white border-b border-gray-100">
                    <Button 
                        variant="tonal" 
                        onClick={() => { onNewProject(); onClose(); }}
                        className="w-full justify-start gap-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-none"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                        <span className="font-bold">New Build Sheet</span>
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                    {projects.map((p) => (
                        <div key={p.id} className={`group relative p-4 rounded-2xl border transition-all cursor-pointer ${p.id === currentId ? 'bg-indigo-600 border-indigo-600 shadow-md' : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'}`} onClick={() => { onSelect(p.id); onClose(); }}>
                            <div className="flex flex-col gap-1">
                                <span className={`font-bold text-sm truncate pr-6 ${p.id === currentId ? 'text-white' : 'text-slate-800'}`}>{p.name || 'Untitled Draft'}</span>
                                <div className="flex items-center justify-between mt-1">
                                    <span className={`text-[10px] font-medium ${p.id === currentId ? 'text-indigo-100' : 'text-slate-400'}`}>{p.preview}</span>
                                    <span className={`text-[9px] font-mono ${p.id === currentId ? 'text-indigo-200' : 'text-slate-300'}`}>{p.lastModified.toLocaleDateString()}</span>
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                                className={`absolute right-3 top-3 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${p.id === currentId ? 'text-white/50 hover:text-white' : 'text-slate-300 hover:text-red-500'}`}
                                aria-label="Delete project"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                        </div>
                    ))}
                    {projects.length === 0 && (
                        <div className="text-center py-20 opacity-40">
                             <p className="text-sm font-medium text-slate-400">No project history found.</p>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-1" onClick={onClose} />
        </div>
    );
};

const KitSummaryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    session: DraftingSession;
    onExport: () => void;
}> = ({ isOpen, onClose, session, onExport }) => {
    if (!isOpen) return null;
    const sourcedParts = session.bom.filter(b => b.sourcing?.online?.length);
    const missingParts = session.bom.filter(b => !b.sourcing?.online?.length);
    const totalCost = session.bom.reduce((acc, curr) => acc + (curr.part.price * curr.quantity), 0);

    return (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-labelledby="kit-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div>
                        <h3 id="kit-title" className="text-2xl font-black text-slate-900 tracking-tight">Your Hardware Kit</h3>
                        <p className="text-sm text-slate-500 font-medium mt-1">Ready for fulfillment & assembly</p>
                    </div>
                    <button onClick={onClose} className="text-slate-300 hover:text-slate-900 transition-colors p-2 text-2xl" aria-label="Close cart">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 bg-slate-900 rounded-[24px] text-white">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Build Cost</label>
                            <div className="text-3xl font-mono font-bold mt-1">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <div className="p-6 bg-indigo-50 rounded-[24px] border border-indigo-100">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Kit Progress</label>
                            <div className="text-3xl font-bold text-indigo-600 mt-1">{Math.round((sourcedParts.length / session.bom.length) * 100)}%</div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Verified Items ({sourcedParts.length})</h4>
                        <div className="space-y-3">
                            {sourcedParts.map((b, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">{b.part.name} <span className="text-slate-400 font-medium ml-2">x{b.quantity}</span></div>
                                        <div className="flex gap-2 mt-1">
                                            {b.sourcing?.online?.slice(0, 1).map((s, idx) => (
                                                <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">Buy on {s.source}</a>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-sm font-mono font-bold text-slate-900">${(b.part.price * b.quantity).toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {missingParts.length > 0 && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-amber-800">
                            <p className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                Action Required
                            </p>
                            <p className="text-sm">We couldn't find automatic purchase links for {missingParts.length} components. These items were still included in your technical audit and assembly plan.</p>
                            <div className="mt-4 space-y-2">
                                {missingParts.map((b, i) => (
                                    <div key={i} className="text-xs font-medium border-l-2 border-amber-200 pl-3 py-1 opacity-70">{b.part.name} (Custom/Inferred)</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-gray-100 bg-white flex gap-3">
                    <Button variant="secondary" onClick={onExport} className="flex-1" aria-label="Export manifest">Export Data</Button>
                    <Button variant="primary" onClick={onClose} className="flex-1" aria-label="Finish kit review">Close Summary</Button>
                </div>
            </div>
        </div>
    );
};

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
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-labelledby="validation-title">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex flex-col">
                        <h3 id="validation-title" className="text-lg font-bold text-slate-800">System Integrity Suite</h3>
                        <p className="text-[10px] text-gray-400 font-mono tracking-tighter">BUILD: BS-STABLE</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2" aria-label="Close modal" disabled={isFixing || isRunning}>&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-slate-900 font-mono text-sm leading-relaxed text-indigo-100">
                    {(isRunning || isFixing) ? (
                        <div className="space-y-2" aria-live="polite">
                             <p className="animate-pulse text-indigo-400">>> {isFixing ? 'REPAIRING ROLES (ARCHITECT, SOURCER)...' : 'INITIALIZING PROBES...'}</p>
                             <p className="animate-pulse text-indigo-300 delay-75">>> ANALYZING BUILD SHEET INTEGRITY...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {['INTEGRITY', 'FLOW', 'ACCESSIBILITY', 'SYSTEM'].map(cat => (
                                <div key={cat}>
                                    <h4 className="text-[10px] text-indigo-500 font-bold mb-3 tracking-widest uppercase text-left">{cat.replace('_', ' ')}</h4>
                                    {results.filter(r => r.category === cat).map((res, i) => (
                                        <div key={i} className="flex gap-4 border-b border-white/5 pb-3 mb-3">
                                            <span className={res.status === 'PASS' ? 'text-emerald-400' : res.status === 'FAIL' ? 'text-rose-400' : 'text-amber-400'} aria-label={`Status: ${res.status}`}>
                                                [{res.status}]
                                            </span>
                                            <div className="text-left">
                                                <p className="font-bold text-white uppercase text-xs">{res.name}</p>
                                                <p className="text-[11px] text-indigo-300/70">{res.message}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-2">
                    {results.some(r => r.status !== 'PASS') && !isFixing && !isRunning && (
                        <Button onClick={handleFix} variant="tonal" className="bg-indigo-50 text-indigo-700" aria-label="Repair fails">One-Click Fix</Button>
                    )}
                    <Button onClick={onRunAgain} variant="secondary" disabled={isRunning || isFixing} aria-label="Re-run tests">Rerun Tests</Button>
                    <Button onClick={onClose} variant="primary" disabled={isFixing || isRunning} aria-label="Close modal">Close</Button>
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
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-labelledby="part-title">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold" aria-hidden="true">
                            {entry.part.category[0] || 'P'}
                        </div>
                        <h3 id="part-title" className="text-lg font-bold text-slate-800">{entry.part.name}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2" aria-label="Close modal">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    <div className="space-y-8">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description</label>
                            <p className="text-sm text-slate-600 leading-relaxed mt-2">{entry.part.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SKU</label>
                                <p className="text-xs font-mono text-slate-800 mt-1">{entry.part.sku}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Target Price</label>
                                <p className="text-xs text-slate-800 mt-1 font-bold">${entry.part.price.toFixed(2)}</p>
                            </div>
                        </div>

                        {entry.sourcing?.loading ? (
                            <div className="p-8 flex flex-col items-center justify-center text-slate-400 space-y-3">
                                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                <span className="text-xs font-medium uppercase tracking-widest">Finding vendors...</span>
                            </div>
                        ) : (
                            <>
                                {entry.sourcing?.online && entry.sourcing.online.length > 0 ? (
                                    <div>
                                        <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Global Marketplace (Gemini Search)</label>
                                        <div className="mt-3 space-y-2">
                                            {entry.sourcing.online.map((s, i) => (
                                                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-100 transition-all group" aria-label={`View at ${s.source}`}>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">{s.source}</span>
                                                        <span className="text-xs font-medium text-slate-800 line-clamp-1">{s.title}</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-indigo-600 group-hover:underline whitespace-nowrap ml-4">{s.price || 'Market Rate'}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ) : entry.sourcing?.online !== undefined && (
                                    <div className="p-4 bg-slate-50 rounded-xl text-center border border-slate-100">
                                        <span className="text-xs text-slate-400 font-medium">No online listings found. Re-trigger update to search again.</span>
                                    </div>
                                )}

                                {entry.sourcing?.local && entry.sourcing.local.length > 0 && (
                                    <div>
                                        <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Local Availability (Gemini Maps)</label>
                                        <div className="mt-3 space-y-2">
                                            {entry.sourcing.local.map((s, i) => (
                                                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all group">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-slate-800">{s.name}</span>
                                                        <span className="text-[10px] text-emerald-700">{s.address}</span>
                                                    </div>
                                                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex flex-wrap gap-2 justify-end">
                    <Button variant="tonal" onClick={() => onSource(entry)} disabled={entry.sourcing?.loading} className="text-xs" aria-label="Force sourcing refresh">Update Sourcing</Button>
                    <Button variant="primary" onClick={onClose} aria-label="Close details">Close</Button>
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
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-labelledby="assembly-title">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRunning ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`} aria-hidden="true">
                            {isRunning ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"><path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div>
                            <h3 id="assembly-title" className="text-lg font-bold text-slate-800">Robotic Assembly Planner</h3>
                            {isDirty && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold ml-2">STALE</span>}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2" aria-label="Close modal">&times;</button>
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
                                    <Button onClick={onRefresh} variant="tonal" className="text-[10px] h-7 px-3 bg-red-100 text-red-700" aria-label="Refresh assembly sequence">Refresh Plan</Button>
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
                                <Button onClick={onLaunchAR} className="bg-white text-indigo-600 border-none px-4 py-2 text-xs" aria-label="Start AR guide">Launch AR</Button>
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
                {!isRunning && <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end"><Button onClick={onClose} variant="primary" aria-label="Exit assembly planner">Done</Button></div>}
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
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-labelledby="audit-title">
             <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-900 text-white`} aria-hidden="true">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 3.040 12.02 12.02 0 00-3.131 8.903 12.01 12.01 0 007.97 10.743l.779.275.779-.275a12.01 12.01 0 007.97-10.743 12.02 12.02 0 00-3.131-8.903z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        <h3 id="audit-title" className="text-lg font-bold text-slate-800">System Integrity Audit</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2" aria-label="Close modal">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-[#F8FAFC]">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
                            <p className="text-gray-400 font-medium text-center">Gemini Thinking (Heavy Reasoner)...</p>
                        </div>
                    ) : (
                        <div className="prose prose-slate max-w-none text-left">
                            {isDirty && (
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex justify-between items-center mb-6">
                                    <p className="text-xs text-amber-700 font-medium m-0">This audit might be outdated due to BOM changes.</p>
                                    <Button onClick={onRefresh} variant="tonal" className="text-[10px] h-7 px-3 bg-amber-100 text-amber-800 border-none" aria-label="Update technical report">Update Audit</Button>
                                </div>
                            )}
                            <ReactMarkdown>{result || "Run an audit to see technical and legal verification."}</ReactMarkdown>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-white flex justify-end"><Button onClick={onClose} variant="primary" aria-label="Close report">Close</Button></div>
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
  const [isKitting, setIsKitting] = useState(false);
  const [kitSummaryOpen, setKitSummaryOpen] = useState(false);
  
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [projectsList, setProjectsList] = useState<ProjectIndexEntry[]>([]);

  // Validation State
  const [validationOpen, setValidationOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<TestResult[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const refreshState = () => {
    setSession(draftingEngine.getSession());
    setProjectsList(draftingEngine.getProjectsList());
  };

  useEffect(() => {
    setProjectsList(draftingEngine.getProjectsList());
  }, []);

  const handleSourcePart = async (entry: BOMEntry) => {
      setSession(prev => ({
          ...prev,
          bom: prev.bom.map(b => b.instanceId === entry.instanceId ? { ...b, sourcing: { ...b.sourcing, loading: true } } : b)
      }));
      try {
          const result = await aiService.findPartSources?.(entry.part.name);
          const local = await aiService.findLocalSuppliers?.(entry.part.name);
          draftingEngine.updatePartSourcing(entry.instanceId, result || [], local || []);
          refreshState();
      } catch (e) { 
          console.error(e);
          draftingEngine.updatePartSourcing(entry.instanceId, [], []);
          refreshState();
      }
  };

  const performVerifyAudit = async (silent = false) => {
      const currentSession = draftingEngine.getSession();
      if (!aiService.verifyDesign || currentSession.bom.length === 0) return;
      
      // Delta optimization
      if (silent && !currentSession.cacheIsDirty && currentSession.cachedAuditResult) return;

      if (!silent) {
        setAuditOpen(true);
        setIsAuditing(true);
      }
      try {
          const res = await aiService.verifyDesign(currentSession.bom, currentSession.designRequirements, currentSession.cachedAuditResult);
          draftingEngine.cacheAuditResult(res.reasoning);
          if (!silent) refreshState();
      } catch (e) { console.error(e); } finally { if (!silent) setIsAuditing(false); }
  }

  const performPlanAssembly = async (silent = false) => {
      const currentSession = draftingEngine.getSession();
      if (!aiService.generateAssemblyPlan || currentSession.bom.length === 0) return;
      
      // Delta optimization
      if (silent && !currentSession.cacheIsDirty && currentSession.cachedAssemblyPlan) return;

      if (!silent) {
        setAssemblyOpen(true);
        setIsPlanningAssembly(true);
      }
      try {
          const plan = await aiService.generateAssemblyPlan(currentSession.bom, currentSession.cachedAssemblyPlan);
          if (plan) {
              draftingEngine.cacheAssemblyPlan(plan);
              if (!silent) refreshState();
          }
      } catch (e) { console.error(e); } finally { if (!silent) setIsPlanningAssembly(false); }
  }

  const performVisualGeneration = async () => {
      const currentSession = draftingEngine.getSession();
      if (isVisualizing || currentSession.bom.length === 0) return;
      setIsVisualizing(true);
      try {
          const requirements = currentSession.designRequirements || currentSession.name || "Hardware assembly";
          const imageUrl = await aiService.generateProductImage(requirements);
          if (imageUrl) {
              draftingEngine.addGeneratedImage(imageUrl, `Design concept for: ${requirements}`);
          }
      } catch (e) { console.error(e); } finally { setIsVisualizing(false); }
  }

  const handleOneClickKit = async () => {
    let latestSession = draftingEngine.getSession();
    if (latestSession.bom.length === 0) return;
    
    const sourcingComplete = draftingEngine.getSourcingCompletion() === 100;
    const processDone = sourcingComplete && !latestSession.cacheIsDirty && latestSession.cachedAuditResult && latestSession.cachedAssemblyPlan;
    
    if (processDone) {
        setKitSummaryOpen(true);
        return;
    }

    setIsKitting(true);
    // Add informational message
    draftingEngine.addMessage({ role: 'assistant', content: "🚀 **One-Click Stabilization Initiated.**\nI'm finding vendors, syncronizing pricing, and performing a heavy-reasoner technical audit.", timestamp: new Date() });
    refreshState();

    try {
        // 1. Fresh loop to ensure no stale BOM entries are missed
        for (const entry of latestSession.bom) {
          if (entry.sourcing?.online === undefined) {
             await handleSourcePart(entry);
          }
        }
        draftingEngine.addMessage({ role: 'assistant', content: "✅ **Pricing synchronized.** Market data successfully applied to all components.", timestamp: new Date() });
        refreshState();
        
        // 2. Proactive AI verification
        draftingEngine.addMessage({ role: 'assistant', content: "🔍 **Technical Audit in progress.** Evaluating system integrity and patent compliance...", timestamp: new Date() });
        refreshState();
        await performVerifyAudit(true);
        
        draftingEngine.addMessage({ role: 'assistant', content: "🤖 **Planning Assembly.** Simulating robotic kinematics and step-by-step guidance...", timestamp: new Date() });
        refreshState();
        await performPlanAssembly(true);
        
        // 3. Visual rendering
        if (draftingEngine.getSession().generatedImages.length === 0) {
            await performVisualGeneration();
        }
        
        draftingEngine.addMessage({ role: 'assistant', content: "✨ **Kit Stabilized.** Your manifest is ready for checkout.", timestamp: new Date() });
        refreshState();
        setKitSummaryOpen(true);
    } catch (e) {
        console.error("Kit stabilization error", e);
        draftingEngine.addMessage({ role: 'assistant', content: "⚠️ **Stabilization Warning.** Some processes failed to complete. Please review BOM manually.", timestamp: new Date() });
    } finally {
        setIsKitting(false);
        refreshState();
    }
  };

  const handleVerifyAudit = async () => {
      const currentSession = draftingEngine.getSession();
      if (currentSession.cachedAuditResult && !currentSession.cacheIsDirty) {
          setAuditOpen(true);
          return;
      }
      await performVerifyAudit();
  };

  const handlePlanAssembly = async () => {
      const currentSession = draftingEngine.getSession();
      if (currentSession.cachedAssemblyPlan && !currentSession.cacheIsDirty) {
          setAssemblyOpen(true);
          return;
      }
      await performPlanAssembly();
  };

  const handleGenerateVisual = async () => {
      await performVisualGeneration();
      refreshState();
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
        if (stateModified) performVisualGeneration().then(() => refreshState());
        refreshState();
    } catch (e: any) {
        draftingEngine.addMessage({ role: 'assistant', content: `[ERROR] ${e.message}`, timestamp: new Date() });
        refreshState();
    } finally { setIsThinking(false); }
  };

  const kitReady = draftingEngine.getSourcingCompletion() === 100 && !session.cacheIsDirty && session.cachedAuditResult && session.cachedAssemblyPlan;

  return (
    <div className="flex h-[100dvh] w-full bg-[#F3F4F6] text-[#1F1F1F] overflow-hidden font-sans relative flex-col md:flex-row">
      <ProjectNavigator 
          isOpen={isNavigatorOpen} 
          onClose={() => setIsNavigatorOpen(false)} 
          projects={projectsList} 
          currentId={session.id} 
          onSelect={(id) => { draftingEngine.loadProject(id); refreshState(); }} 
          onDelete={(id) => { draftingEngine.deleteProject(id); refreshState(); }} 
          onNewProject={() => { draftingEngine.createNewProject(); refreshState(); }}
      />
      <KitSummaryModal isOpen={kitSummaryOpen} onClose={() => setKitSummaryOpen(false)} session={session} onExport={handleExport} />
      <ValidationReportModal 
        isOpen={validationOpen} 
        onClose={() => setValidationOpen(false)} 
        results={validationResults} 
        isRunning={isValidating} 
        onRunAgain={runValidationSuite} 
        onFixAll={handleOneClickKit} 
      />
      <AssemblyModal isOpen={assemblyOpen} onClose={() => setAssemblyOpen(false)} plan={session.cachedAssemblyPlan || null} isRunning={isPlanningAssembly} isDirty={session.cacheIsDirty} onLaunchAR={() => setArOpen(true)} onRefresh={() => performPlanAssembly()} />
      <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} result={session.cachedAuditResult || null} isRunning={isAuditing} isDirty={session.cacheIsDirty} onRefresh={() => performVerifyAudit()} />
      <PartDetailModal entry={selectedPart} onClose={() => setSelectedPart(null)} onSource={handleSourcePart} />
      {arOpen && session.cachedAssemblyPlan && <ARGuideView plan={session.cachedAssemblyPlan} aiService={aiService} onClose={() => setArOpen(false)} />}

      <nav className="hidden md:flex w-[88px] border-r border-gray-200 bg-white flex-col items-center py-6 gap-6 z-20 shadow-sm">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg" aria-hidden="true">B</div>
        <div className="flex flex-col gap-4 flex-1 items-center">
            <button onClick={() => { setProjectsList(draftingEngine.getProjectsList()); setIsNavigatorOpen(true); }} className="w-12 h-12 flex items-center justify-center text-slate-500 bg-slate-50 rounded-2xl hover:bg-slate-100 hover:text-slate-900 transition-colors focus:ring-2 ring-indigo-500 outline-none" aria-label="Open project navigator"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></button>
            <button onClick={() => { draftingEngine.createNewProject(); refreshState(); }} className="w-12 h-12 flex items-center justify-center text-indigo-600 bg-indigo-50 rounded-2xl hover:bg-indigo-100 transition-colors focus:ring-2 ring-indigo-500 outline-none" aria-label="New project"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg></button>
            <button onClick={handleExport} className="w-12 h-12 flex items-center justify-center text-emerald-600 bg-emerald-50 rounded-2xl hover:bg-emerald-100 transition-colors focus:ring-2 ring-emerald-500 outline-none" aria-label="Export manifest"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></button>
            <button onClick={runValidationSuite} className="w-12 h-12 flex items-center justify-center text-rose-600 bg-rose-50 rounded-2xl hover:bg-rose-100 transition-colors focus:ring-2 ring-rose-500 outline-none" aria-label="Run tests"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 3.040 12.02 12.02 0 00-3.131 8.903 12.01 12.01 0 007.97 10.743l.779.275.779-.275a12.01 12.01 0 007.97-10.743 12.02 12.02 0 00-3.131-8.903z"></path></svg></button>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 flex flex-col border-r border-gray-200 bg-white" aria-label="Drafting Canvas">
          <header className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <h1 className="font-medium text-xl tracking-tight text-slate-900">{session.name || "Untitled Draft"}</h1>
            <div className="flex gap-2 items-center">
                {session.cacheIsDirty && session.bom.length > 0 && <Chip label="MODIFIED" color="bg-amber-100 text-amber-800 font-bold border-amber-200" />}
                <button onClick={() => setIsBomOpen(!isBomOpen)} className="p-2 text-slate-400 hover:text-slate-800 transition-colors focus:ring-2 ring-slate-200 rounded-lg outline-none" aria-label={isBomOpen ? "Hide BOM" : "Show BOM"}><svg className={`w-5 h-5 transition-transform ${isBomOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
            </div>
          </header>

          <div className="bg-[#F8FAFC] border-b border-gray-200 p-4 h-[35%] overflow-hidden">
             <ChiltonVisualizer images={session.generatedImages} onGenerate={handleGenerateVisual} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white" aria-label="Conversation Feed">
            {session.messages.length === 0 && (
                <div className="text-center py-10 opacity-60">
                    <p className="text-sm font-medium text-slate-500">Describe your hardware project to begin drafting.</p>
                </div>
            )}
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[24px] px-6 py-4 shadow-sm border border-transparent ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-[#F1F5F9] text-slate-800'}`}>
                  {/* Fix: Wrap ReactMarkdown in a div to apply styling, as the component no longer accepts className directly. */}
                  <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'prose-invert text-white' : 'prose-slate text-slate-800'}`}>
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isThinking && <div className="flex justify-start"><div className="bg-[#F1F5F9] rounded-[24px] px-6 py-4 animate-pulse text-slate-500 text-sm font-medium border border-gray-100">Architect is reasoning...</div></div>}
            <div ref={chatEndRef} />
          </div>

          <footer className="p-6 border-t border-gray-100 bg-white">
            <div className="relative max-w-4xl mx-auto">
                <textarea 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="E.g. Build a mechanical keyboard with linear switches..." 
                    className="w-full pl-6 pr-16 py-4 bg-[#F1F5F9] border border-transparent rounded-[28px] text-sm text-slate-900 resize-none outline-none focus:ring-2 ring-indigo-500/20 focus:bg-white focus:border-indigo-100 transition-all" 
                    rows={1} 
                    aria-label="Instruction input"
                />
                <button onClick={handleSend} className="absolute right-2 top-2 w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-slate-800 transition-colors shadow-sm focus:ring-2 ring-indigo-500 outline-none" aria-label="Send message"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>
            </div>
          </footer>
        </section>

        {isBomOpen && (
          <section className="w-[450px] flex flex-col bg-white border-l border-gray-200 shadow-lg animate-in slide-in-from-right duration-300" aria-label="BOM Panel">
            <header className="px-6 py-6 border-b border-gray-200 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-xs uppercase tracking-widest text-slate-500">Bill of Materials</h2>
                <div className="text-2xl font-mono font-bold text-indigo-600" aria-label={`Total cost: ${draftingEngine.getTotalCost()}`}>${draftingEngine.getTotalCost().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <Button 
                variant={kitReady ? "primary" : "secondary"} 
                className={`w-full text-sm h-12 font-bold transition-all shadow-lg ${kitReady ? 'bg-indigo-600' : 'bg-indigo-50 text-indigo-700'}`} 
                onClick={handleOneClickKit} 
                disabled={isKitting}
                aria-label={kitReady ? "Review and checkout" : "Source and validate build"}
              >
                {isKitting ? (
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                        Stabilizing Build...
                    </div>
                ) : kitReady ? (
                    <div className="flex items-center gap-2">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                         Checkout Kit
                    </div>
                ) : 'One-Click Kit'}
              </Button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]" aria-label="Parts list">
              {session.bom.map(entry => (
                <Card key={entry.instanceId} className="p-4 hover:shadow-md cursor-pointer transition-all border border-transparent hover:border-indigo-100 bg-white shadow-sm" onClick={() => setSelectedPart(entry)} aria-label={`View ${entry.part.name}`}>
                  <div className="flex justify-between items-center">
                    <div>
                        <div className="font-bold text-sm text-slate-800">{entry.part.name}</div>
                        <div className="flex gap-2 items-center mt-1">
                            <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{entry.part.sku}</span>
                            <span className="text-[10px] text-slate-500 font-medium">x{entry.quantity}</span>
                            {entry.part.price === 0 ? <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Owned</span> : entry.sourcing?.online?.length ? <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Sourced</span> : entry.sourcing?.online !== undefined ? <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Custom</span> : <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Pending</span>}
                        </div>
                    </div>
                    <div className="text-xs font-bold text-slate-900">${(entry.part.price * entry.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                </Card>
              ))}
              {session.bom.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-40 text-center px-12 py-32">
                    <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <p className="text-sm font-medium text-slate-400">Describe your project to build the sheet.</p>
                  </div>
              )}
            </div>

            <footer className="p-6 border-t border-gray-200 grid grid-cols-2 gap-3 bg-white">
              <Button onClick={handleVerifyAudit} className={`text-white text-xs h-10 transition-all ${session.cacheIsDirty ? 'bg-indigo-600 shadow-lg' : 'bg-slate-900 opacity-60'}`} aria-label="Open technical audit">
                {session.cachedAuditResult && !session.cacheIsDirty ? 'View Audit' : 'Verify Design'}
              </Button>
              <Button onClick={handlePlanAssembly} className={`text-white text-xs h-10 transition-all ${session.cacheIsDirty ? 'bg-blue-600 shadow-lg' : 'bg-blue-800 opacity-60'}`} aria-label="Open assembly sequence">
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
