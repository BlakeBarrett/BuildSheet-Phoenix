import React, { Component, useState, useRef, useEffect, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine, ProjectIndexEntry } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { DraftingSession, UserMessage, User, BOMEntry, Part, AssemblyPlan, EnclosureSpec } from './types.ts';
import { Button, Chip, Card, GoogleSignInButton, IconButton } from './components/Material3UI.tsx';
import { ChiltonVisualizer } from './components/ChiltonVisualizer.tsx';
import { useService } from './contexts/ServiceContext.tsx';
import { ARGuideView } from './components/ARGuideView.tsx';
import { TestSuite, TestResult } from './services/testSuite.ts';
import { CookieConsent } from './components/CookieConsent.tsx';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps { children?: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Uncaught error:", error, errorInfo); }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-full flex items-center justify-center bg-[#1E1E1E] text-white p-8">
                    <div className="max-w-lg text-center">
                        <span className="material-symbols-rounded text-[64px] text-[#FFB4AB] mb-4" aria-hidden="true">error_med</span>
                        <h1 className="text-3xl font-bold text-[#FFB4AB] mb-2 tracking-tight">System Critical Failure</h1>
                        <p className="mb-6 text-[#E2E2E2] text-lg">The application encountered an unrecoverable error.</p>
                        <pre className="bg-black/30 p-6 rounded-[24px] text-xs font-mono overflow-auto border border-[#FFB4AB]/30 text-left leading-relaxed">{this.state.error?.message}</pre>
                        <Button onClick={() => window.location.reload()} variant="tonal" className="mt-8 w-full" icon="restart_alt">Reboot System</Button>
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
    onExport: () => void;
    onValidate: () => void;
}> = ({ isOpen, onClose, projects, currentId, onSelect, onDelete, onNewProject, onExport, onValidate }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="nav-title">
            <div className="absolute left-4 top-4 bottom-4 w-[85vw] md:w-[380px] bg-[#F0F4F9] rounded-[28px] shadow-2xl flex flex-col animate-in slide-in-from-left-4 duration-300 overflow-hidden">
                <header className="p-6 pb-2 flex justify-between items-center">
                    <div>
                        <h3 id="nav-title" className="text-2xl font-bold text-slate-800 leading-tight tracking-tight">Build History</h3>
                        <p className="text-sm text-slate-600 font-medium">Your Projects</p>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close Navigator" />
                </header>

                <div className="p-4">
                    <Button
                        variant="tonal"
                        icon="add_circle"
                        onClick={() => { onNewProject(); onClose(); }}
                        className="w-full justify-start bg-white hover:bg-white/80 shadow-sm"
                    >
                        New Build Sheet
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-2">
                    {projects.map((p) => (
                        <div key={p.id} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(p.id)} className={`group relative p-3 rounded-[20px] transition-all cursor-pointer flex gap-4 items-center focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none ${p.id === currentId ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-800 hover:bg-indigo-50'}`} onClick={() => { onSelect(p.id); onClose(); }}>
                            {/* Visual Thumbnail */}
                            <div className={`w-14 h-14 rounded-[16px] overflow-hidden flex-shrink-0 border ${p.id === currentId ? 'border-indigo-400' : 'border-gray-100'}`}>
                                {p.thumbnail ? (
                                    <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center ${p.id === currentId ? 'bg-indigo-700' : 'bg-slate-100'}`}>
                                        <span className={`material-symbols-rounded ${p.id === currentId ? 'text-indigo-300' : 'text-slate-300'}`} aria-hidden="true">draft</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-bold text-base truncate pr-6">{p.name || 'Untitled Draft'}</span>
                                <span className={`text-xs truncate ${p.id === currentId ? 'text-indigo-100' : 'text-slate-500'}`}>{p.preview}</span>
                            </div>

                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                                aria-label={`Delete ${p.name}`}
                                className={`p-2 rounded-full opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity focus-visible:opacity-100 ${p.id === currentId ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                            >
                                <span className="material-symbols-rounded text-[20px]" aria-hidden="true">delete</span>
                            </button>
                        </div>
                    ))}
                    {projects.length === 0 && (
                        <div className="text-center py-20 opacity-40">
                            <p className="text-sm font-medium text-slate-500">No project history found.</p>
                        </div>
                    )}
                </div>

                <footer className="p-4 bg-white/50 border-t border-gray-200/50">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-2">Project Tools</p>
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => { onValidate(); onClose(); }} variant="tonal" className="text-xs h-10 bg-rose-50 text-rose-800 hover:bg-rose-100" icon="health_and_safety">Health Check</Button>
                        <Button onClick={() => { onExport(); onClose(); }} variant="tonal" className="text-xs h-10 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" icon="output">Export</Button>
                    </div>
                </footer>
            </div>
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
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="kit-title">
            <div className="bg-[#F0F4F9] rounded-[32px] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 pb-4 flex justify-between items-start">
                    <div>
                        <h3 id="kit-title" className="text-3xl font-bold text-slate-900 tracking-tight">Your Hardware Kit</h3>
                        <p className="text-base text-slate-600 font-medium mt-1">Ready for fulfillment & assembly</p>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close" />
                </div>
                <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 bg-slate-900 rounded-[24px] text-white shadow-lg">
                            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total Build Cost</label>
                            <div className="text-4xl font-mono font-medium mt-1 tracking-tight">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <div className="p-6 bg-indigo-100 rounded-[24px] text-indigo-900">
                            <label className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Kit Progress</label>
                            <div className="text-4xl font-medium mt-1 tracking-tight">{Math.round((sourcedParts.length / session.bom.length) * 100)}%</div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-4 px-1">Verified Items ({sourcedParts.length})</h4>
                        <div className="space-y-2">
                            {sourcedParts.map((b, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-white rounded-[20px] shadow-sm">
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-base">{b.part.name} <span className="text-slate-500 font-medium ml-2">x{b.quantity}</span></div>
                                        <div className="flex gap-2 mt-2">
                                            {b.sourcing?.online?.slice(0, 1).map((s, idx) => (
                                                <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors flex items-center gap-1">
                                                    <span className="material-symbols-rounded text-[14px]" aria-hidden="true">shopping_cart</span>
                                                    Buy on {s.source}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-base font-mono font-bold text-slate-900">${(b.part.price * b.quantity).toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {missingParts.length > 0 && (
                        <div className="p-5 bg-amber-50 rounded-[24px] text-amber-900">
                            <p className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="material-symbols-rounded text-[18px]" aria-hidden="true">warning</span>
                                Action Required
                            </p>
                            <p className="text-sm leading-relaxed">We couldn't find automatic purchase links for {missingParts.length} components. These items were still included in your technical audit and assembly plan.</p>
                            <div className="mt-4 space-y-2">
                                {missingParts.map((b, i) => (
                                    <div key={i} className="text-xs font-medium border-l-4 border-amber-200 pl-3 py-1 opacity-80">{b.part.name} (Custom/Inferred)</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-6 pt-2 flex gap-3">
                    <Button variant="tonal" onClick={onExport} className="flex-1" icon="download">Export Data</Button>
                    <Button variant="primary" onClick={onClose} className="flex-1" icon="check">Done</Button>
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
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="validation-title">
            <div className="bg-[#1E1E1E] text-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <div className="flex flex-col">
                        <h3 id="validation-title" className="text-xl font-bold tracking-tight">System Integrity Suite</h3>
                        <p className="text-xs text-indigo-300 font-mono mt-1">BUILD: BS-STABLE-V2</p>
                    </div>
                    <IconButton icon="close" onClick={onClose} className="text-white hover:bg-white/10" disabled={isFixing || isRunning} title="Close" />
                </div>
                <div className="flex-1 overflow-y-auto p-8 font-mono text-sm leading-relaxed text-indigo-100">
                    {(isRunning || isFixing) ? (
                        <div className="space-y-4" aria-live="polite">
                            <div className="flex items-center gap-3 text-indigo-400">
                                <span className="material-symbols-rounded animate-spin" aria-hidden="true">settings</span>
                                <p className="animate-pulse">{'>>'} {isFixing ? 'REPAIRING ROLES (ARCHITECT, SOURCER)...' : 'INITIALIZING PROBES...'}</p>
                            </div>
                            <p className="text-indigo-300/50 delay-75 pl-9">{'>>'} ANALYZING BUILD SHEET INTEGRITY...</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {['INTEGRITY', 'FLOW', 'ACCESSIBILITY', 'SYSTEM'].map(cat => (
                                <div key={cat}>
                                    <h4 className="text-[10px] text-indigo-500 font-bold mb-4 tracking-[0.2em] uppercase text-left border-b border-indigo-500/30 pb-2">{cat.replace('_', ' ')}</h4>
                                    {results.filter(r => r.category === cat).map((res, i) => (
                                        <div key={i} className="flex gap-4 mb-4 items-start">
                                            <span className={`text-[18px] material-symbols-rounded ${res.status === 'PASS' ? 'text-emerald-400' : res.status === 'FAIL' ? 'text-rose-400' : 'text-amber-400'}`} aria-label={`Status: ${res.status}`}>
                                                {res.status === 'PASS' ? 'check_circle' : res.status === 'FAIL' ? 'cancel' : 'warning'}
                                            </span>
                                            <div className="text-left flex-1">
                                                <p className="font-bold text-white uppercase text-xs mb-0.5">{res.name}</p>
                                                <p className="text-[11px] text-indigo-200/60 leading-normal">{res.message}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-white/10 bg-[#252525] flex justify-end gap-3">
                    {results.some(r => r.status !== 'PASS') && !isFixing && !isRunning && (
                        <Button onClick={handleFix} variant="tonal" className="bg-indigo-500 text-white hover:bg-indigo-400 border-none" icon="build_circle">Auto Fix</Button>
                    )}
                    <Button onClick={onRunAgain} variant="ghost" disabled={isRunning || isFixing} className="text-indigo-200 hover:bg-white/5" icon="refresh">Rerun</Button>
                    <Button onClick={onClose} variant="secondary" disabled={isFixing || isRunning} className="bg-white text-black hover:bg-gray-200 border-none">Dismiss</Button>
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
        <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="part-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[16px] bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl" aria-hidden="true">
                            {entry.part.category[0] || 'P'}
                        </div>
                        <div>
                            <h3 id="part-title" className="text-xl font-bold text-slate-800 tracking-tight">{entry.part.name}</h3>
                            <p className="text-xs text-slate-600 font-medium">{entry.part.brand}</p>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close" />
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-6">
                        <div className="bg-[#F0F4F9] p-4 rounded-[20px]">
                            <p className="text-sm text-slate-700 leading-relaxed">{entry.part.description}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">SKU</label>
                                <p className="text-sm font-mono text-slate-900 mt-1">{entry.part.sku}</p>
                            </div>
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Price</label>
                                <p className="text-sm text-slate-900 mt-1 font-bold">${entry.part.price.toFixed(2)}</p>
                            </div>
                        </div>

                        {entry.sourcing?.loading ? (
                            <div className="p-8 flex flex-col items-center justify-center text-slate-500 space-y-4 bg-white rounded-[20px] border border-dashed border-gray-200">
                                <span className="material-symbols-rounded animate-spin text-3xl text-indigo-300" aria-hidden="true">progress_activity</span>
                                <span className="text-xs font-medium uppercase tracking-widest">Finding vendors...</span>
                            </div>
                        ) : (
                            <>
                                {entry.sourcing?.online && entry.sourcing.online.length > 0 ? (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-rounded text-indigo-600 text-[18px]" aria-hidden="true">public</span>
                                            <label className="text-[11px] font-bold text-indigo-900 uppercase tracking-widest">Global Marketplace</label>
                                        </div>
                                        <div className="space-y-2">
                                            {entry.sourcing.online.map((s, i) => (
                                                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-white rounded-[16px] border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group" aria-label={`View at ${s.source}`}>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{s.source}</span>
                                                        <span className="text-sm font-medium text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">{s.title}</span>
                                                    </div>
                                                    <span className="text-sm font-bold text-indigo-600 ml-4">{s.price || 'Market Rate'}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ) : entry.sourcing?.online !== undefined && (
                                    <div className="p-4 bg-slate-50 rounded-[16px] text-center">
                                        <span className="text-xs text-slate-500 font-medium">No online listings found. Re-trigger update to search again.</span>
                                    </div>
                                )}

                                {entry.sourcing?.local && entry.sourcing.local.length > 0 && (
                                    <div className="mt-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-rounded text-emerald-600 text-[18px]" aria-hidden="true">location_on</span>
                                            <label className="text-[11px] font-bold text-emerald-900 uppercase tracking-widest">Local Availability</label>
                                        </div>
                                        <div className="space-y-2">
                                            {entry.sourcing.local.map((s, i) => (
                                                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-emerald-50 rounded-[16px] border border-emerald-100 hover:bg-emerald-100 transition-all group">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-800">{s.name}</span>
                                                        <span className="text-[11px] text-emerald-700">{s.address}</span>
                                                    </div>
                                                    <span className="material-symbols-rounded text-emerald-600" aria-hidden="true">arrow_outward</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 flex flex-wrap gap-3 justify-end">
                    <Button variant="tonal" onClick={() => onSource(entry)} disabled={entry.sourcing?.loading} icon="refresh">Update Sourcing</Button>
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
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="assembly-title">
            <div className="bg-[#F4F7FC] rounded-[32px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shadow-sm ${isRunning ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`} aria-hidden="true">
                            <span className={`material-symbols-rounded text-[28px] ${isRunning ? 'animate-spin' : ''}`} aria-hidden="true">
                                {isRunning ? 'settings_motion_mode' : 'precision_manufacturing'}
                            </span>
                        </div>
                        <div>
                            <h3 id="assembly-title" className="text-xl font-bold text-slate-800 tracking-tight">Robotic Assembly Planner</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600 font-medium">Kinematic Solver Engine</span>
                                {isDirty && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Stale</span>}
                            </div>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close" />
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 font-sans text-sm leading-relaxed text-slate-600">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-6">
                            <div className="relative w-20 h-20">
                                <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-slate-500 font-medium animate-pulse">Calculating end-effector paths...</p>
                        </div>
                    ) : plan ? (
                        <div className="space-y-6">
                            {isDirty && (
                                <div className="bg-red-50 border border-red-100 p-4 rounded-[20px] flex justify-between items-center">
                                    <p className="text-sm text-red-800 font-medium flex items-center gap-2">
                                        <span className="material-symbols-rounded text-[18px]" aria-hidden="true">warning</span>
                                        Draft changed. Plan may be invalid.
                                    </p>
                                    <Button onClick={onRefresh} variant="tonal" className="text-xs h-8 px-3 bg-white text-red-700 hover:bg-red-50" icon="refresh">Refresh</Button>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-4 bg-blue-50 rounded-[20px]">
                                    <div className="text-[10px] uppercase font-bold text-blue-400 mb-1 tracking-wider">Feasibility</div>
                                    <div className="text-2xl font-bold text-blue-900 tracking-tight">{plan.automationFeasibility}%</div>
                                </div>
                                <div className="p-4 bg-orange-50 rounded-[20px]">
                                    <div className="text-[10px] uppercase font-bold text-orange-400 mb-1 tracking-wider">Difficulty</div>
                                    <div className="text-2xl font-bold text-orange-900 tracking-tight">{plan.difficulty}</div>
                                </div>
                                <div className="p-4 bg-white rounded-[20px] border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-1 tracking-wider">Est. Time</div>
                                    <div className="text-2xl font-bold text-slate-700 tracking-tight">{plan.totalTime}</div>
                                </div>
                            </div>

                            <div className="p-5 bg-indigo-600 rounded-[24px] text-white flex justify-between items-center shadow-lg shadow-indigo-200 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-500"></div>
                                <div className="relative z-10">
                                    <h4 className="font-bold text-lg mb-1">Multimodal AR Guide</h4>
                                    <p className="text-indigo-100 text-xs font-medium">Live assembly overlay via camera.</p>
                                </div>
                                <Button onClick={onLaunchAR} className="relative z-10 bg-white text-indigo-700 hover:bg-indigo-50 border-none" icon="view_in_ar">Launch</Button>
                            </div>

                            <div>
                                <h4 className="font-bold text-xs uppercase text-slate-500 mb-4 tracking-widest pl-2">Sequence</h4>
                                <div className="space-y-4 relative before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gray-200">
                                    {plan.steps.map((step, i) => (
                                        <div key={i} className="relative pl-12 group">
                                            <div className="absolute left-0 top-0 w-10 h-10 bg-white border-2 border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm shadow-sm z-10 group-hover:scale-110 group-hover:border-indigo-500 transition-all">
                                                {step.stepNumber}
                                            </div>
                                            <div className="bg-white rounded-[20px] p-5 shadow-sm border border-gray-100 group-hover:shadow-md transition-shadow">
                                                <div className="font-medium text-slate-900 text-base mb-2">{step.description}</div>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-2 py-1 bg-slate-100 rounded-[8px] text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                                        <span className="material-symbols-rounded text-[14px]" aria-hidden="true">build</span> {step.requiredTool}
                                                    </span>
                                                    <span className="px-2 py-1 bg-slate-100 rounded-[8px] text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                                                        <span className="material-symbols-rounded text-[14px]" aria-hidden="true">schedule</span> {step.estimatedTime}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : <div className="text-center text-gray-400 py-10">No plan generated.</div>}
                </div>
                {!isRunning && (
                    <div className="p-6 border-t border-gray-200 bg-white flex justify-end">
                        <Button onClick={onClose} variant="primary">Done</Button>
                    </div>
                )}
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
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="audit-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shadow-sm ${isRunning ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'}`} aria-hidden="true">
                            <span className={`material-symbols-rounded text-[28px] ${isRunning ? 'animate-spin' : ''}`} aria-hidden="true">
                                {isRunning ? 'refresh' : 'policy'}
                            </span>
                        </div>
                        <div>
                            <h3 id="audit-title" className="text-xl font-bold text-slate-800 tracking-tight">Technical Audit</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600 font-medium">System Integrity Verification</span>
                                {isDirty && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Stale</span>}
                            </div>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close" />
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    {isRunning ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-6">
                            <div className="relative w-20 h-20">
                                <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-slate-500 font-medium animate-pulse">Analyzing BOM against requirements...</p>
                        </div>
                    ) : result ? (
                        <div className="prose prose-sm max-w-none text-slate-600">
                            <ReactMarkdown>{result}</ReactMarkdown>
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 py-10">
                            No audit results available. Run a verification check.
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <Button variant="tonal" onClick={onRefresh} disabled={isRunning} icon="refresh">Re-Run Audit</Button>
                    <Button variant="primary" onClick={onClose}>Done</Button>
                </div>
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

    // Mobile State
    const [mobileTab, setMobileTab] = useState<'draft' | 'bom'>('draft');

    // Validation State
    const [validationOpen, setValidationOpen] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [validationResults, setValidationResults] = useState<TestResult[]>([]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session.messages, mobileTab]);

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
        draftingEngine.addMessage({ role: 'assistant', content: "🚀 **One-Click Stabilization Initiated.**\nI'm finding vendors, syncronizing pricing, and performing a heavy-reasoner technical audit.", timestamp: new Date() });
        refreshState();

        try {
            for (const entry of latestSession.bom) {
                if (entry.sourcing?.online === undefined) {
                    await handleSourcePart(entry);
                }
            }
            draftingEngine.addMessage({ role: 'assistant', content: "✅ **Pricing synchronized.** Market data successfully applied to all components.", timestamp: new Date() });
            refreshState();

            draftingEngine.addMessage({ role: 'assistant', content: "🔍 **Technical Audit in progress.** Evaluating system integrity and patent compliance...", timestamp: new Date() });
            refreshState();
            await performVerifyAudit(true);

            draftingEngine.addMessage({ role: 'assistant', content: "🤖 **Planning Assembly.** Simulating robotic kinematics and step-by-step guidance...", timestamp: new Date() });
            refreshState();
            await performPlanAssembly(true);

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
            // Fix: Map 'assistant' role to 'model' for Gemini API compatibility
            const history = session.messages.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));
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
        <div className="flex h-[100dvh] w-full bg-[#F0F4F9] text-[#1F1F1F] overflow-hidden font-sans relative flex-col md:flex-row p-0 pb-[90px] md:p-3 md:pb-[90px] lg:pb-3 gap-3">

            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-6 focus:py-3 focus:bg-indigo-600 focus:text-white focus:rounded-full focus:shadow-xl focus:font-bold">Skip to Main Content</a>

            <ProjectNavigator
                isOpen={isNavigatorOpen}
                onClose={() => setIsNavigatorOpen(false)}
                projects={projectsList}
                currentId={session.id}
                onSelect={(id) => { draftingEngine.loadProject(id); refreshState(); }}
                onDelete={(id) => { draftingEngine.deleteProject(id); refreshState(); }}
                onNewProject={() => { draftingEngine.createNewProject(); refreshState(); }}
                onExport={handleExport}
                onValidate={runValidationSuite}
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

            <CookieConsent />

            {/* M3 Navigation Rail (Floating on Desktop) */}
            <nav className="hidden md:flex w-[80px] bg-white rounded-[40px] shadow-sm flex-col items-center py-6 gap-6 z-20 shrink-0 h-full border border-gray-100">
                <div className="w-12 h-12 bg-indigo-600 rounded-[16px] flex items-center justify-center text-white shadow-md">
                    <span className="material-symbols-rounded text-2xl" aria-hidden="true">construction</span>
                </div>

                <div className="flex flex-col gap-3 flex-1 items-center w-full">
                    <IconButton
                        icon="folder_open"
                        onClick={() => { setProjectsList(draftingEngine.getProjectsList()); setIsNavigatorOpen(true); }}
                        title="Projects"
                    />
                    <IconButton
                        icon="add_box"
                        onClick={() => { draftingEngine.createNewProject(); refreshState(); }}
                        title="New Project"
                    />

                    <div className="w-8 h-[1px] bg-gray-200 my-1"></div>

                    <IconButton
                        icon="health_and_safety"
                        onClick={runValidationSuite}
                        className="text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        title="System Health"
                    />
                    <IconButton
                        icon="output"
                        onClick={handleExport}
                        className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        title="Export"
                    />
                </div>

                <div className="pb-2">
                    <IconButton icon="account_circle" title="User Profile" />
                </div>
            </nav>

            {/* Main Content Area - Split Pane Layout */}
            <main id="main-content" className="flex-1 flex overflow-hidden relative gap-3 h-full">

                {/* PANE 1: DRAFTING TABLE (Chat & Vis) */}
                <div className={`flex-1 flex flex-col h-full bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden relative ${mobileTab === 'draft' ? 'flex' : 'hidden lg:flex'}`}>
                    {/* Toolbar */}
                    <header className="px-6 py-4 flex justify-between items-center bg-white z-20 shrink-0">
                        <div className="flex items-center gap-3 md:hidden">
                            <IconButton icon="menu" onClick={() => { setProjectsList(draftingEngine.getProjectsList()); setIsNavigatorOpen(true); }} className="md:hidden -ml-2" title="Menu" />
                        </div>

                        <div className="flex flex-col">
                            <h1 className="font-bold text-lg md:text-xl tracking-tight text-slate-800 truncate">{session.name || "Untitled Draft"}</h1>
                            <span className="text-xs text-slate-500 font-medium tracking-wide">BuildSheet Drafting Engine</span>
                        </div>

                        <div className="flex gap-2 items-center">
                            {session.cacheIsDirty && session.bom.length > 0 && <Chip label="Unsaved Changes" color="bg-amber-100 text-amber-900 border-transparent" />}
                        </div>
                    </header>

                    {/* Hero Visualizer */}
                    <div className="px-4 pb-2 h-[40%] shrink-0">
                        <ChiltonVisualizer images={session.generatedImages} onGenerate={handleGenerateVisual} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
                    </div>

                    {/* Conversation Feed */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 bg-white" aria-label="Conversation Feed" tabIndex={0}>
                        {session.messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full opacity-60">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                    <span className="material-symbols-rounded text-slate-300 text-3xl" aria-hidden="true">chat_bubble_outline</span>
                                </div>
                                <p className="text-sm font-medium text-slate-500">Describe your hardware project to begin.</p>
                            </div>
                        )}
                        {session.messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                <div className={`
                        max-w-[85%] px-6 py-4 text-sm leading-relaxed shadow-sm
                        ${m.role === 'user'
                                        ? 'bg-[#4F5DFF] text-white rounded-[24px] rounded-br-[4px]'
                                        : 'bg-[#F2F6FC] text-[#1F1F1F] rounded-[24px] rounded-bl-[4px] border border-white'}
                    `}>
                                    <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'prose-invert' : 'prose-slate'}`}>
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isThinking && (
                            <div className="flex justify-start">
                                <div className="bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm flex items-center gap-2">
                                    <span className="material-symbols-rounded animate-spin text-indigo-500 text-sm" aria-hidden="true">hourglass_empty</span>
                                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Reasoning</span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Area */}
                    <footer className="p-4 bg-white shrink-0 z-20">
                        <div className="relative bg-[#F2F6FC] rounded-[32px] transition-all hover:bg-[#EBF1F8] focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 focus-within:shadow-md">
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder="Instruct Gemini to build..."
                                aria-label="Instruct Gemini to build"
                                className="w-full pl-6 pr-14 py-4 bg-transparent border-none text-slate-800 resize-none outline-none placeholder:text-slate-500"
                                rows={1}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isThinking}
                                aria-label="Send Message"
                                className="absolute right-2 top-2 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-all shadow-md active:scale-90 disabled:opacity-0 disabled:scale-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 focus-visible:outline-none"
                            >
                                <span className="material-symbols-rounded" aria-hidden="true">arrow_upward</span>
                            </button>
                        </div>
                    </footer>
                </div>

                {/* PANE 2: BOM & ACTIONS (Right Sidebar) */}
                <div className={`lg:w-[420px] xl:w-[460px] flex-col bg-[#F8FAFC] rounded-[32px] border border-gray-200 shadow-sm overflow-hidden ${mobileTab === 'bom' ? 'flex flex-1' : 'hidden lg:flex'}`}>
                    <header className="px-6 py-6 bg-white border-b border-gray-100 flex flex-col gap-4">
                        <div className="flex justify-between items-end">
                            <div>
                                <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">Total Estimate</h2>
                                <div className="text-3xl font-bold text-indigo-900 tracking-tight" aria-label={`Total cost: ${draftingEngine.getTotalCost()}`}>
                                    ${draftingEngine.getTotalCost().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-medium text-slate-500">{session.bom.length} Components</span>
                            </div>
                        </div>

                        <Button
                            variant={kitReady ? "primary" : "fab"}
                            className={`w-full h-14 text-sm font-bold shadow-lg transition-all ${kitReady ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : ''}`}
                            onClick={handleOneClickKit}
                            disabled={isKitting}
                            icon={isKitting ? "motion_mode" : kitReady ? "shopping_cart_checkout" : "magic_button"}
                        >
                            {isKitting ? 'Stabilizing Kit...' : kitReady ? 'Checkout Kit' : 'One-Click Kit'}
                        </Button>
                    </header>

                    {/* Parts List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {session.bom.map(entry => (
                            <Card key={entry.instanceId} onClick={() => setSelectedPart(entry)} className="p-4 cursor-pointer group border border-transparent hover:border-indigo-100">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="font-bold text-sm text-slate-800 group-hover:text-indigo-700 transition-colors">{entry.part.name}</div>
                                        <div className="flex gap-2 items-center mt-2 flex-wrap">
                                            <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{entry.part.sku}</span>
                                            <span className="text-[10px] font-bold text-slate-500">x{entry.quantity}</span>
                                            {entry.part.price === 0
                                                ? <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">Owned</span>
                                                : entry.sourcing?.online?.length
                                                    ? <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1"><span className="material-symbols-rounded text-[12px]" aria-hidden="true">check</span>Sourced</span>
                                                    : <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                                            }
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-slate-900 ml-4">${(entry.part.price * entry.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                            </Card>
                        ))}
                        {session.bom.length === 0 && (
                            <div className="h-64 flex flex-col items-center justify-center opacity-40 text-center px-8">
                                <span className="material-symbols-rounded text-4xl text-slate-300 mb-2" aria-hidden="true">list_alt</span>
                                <p className="text-sm font-medium text-slate-500">Bill of Materials is empty.</p>
                            </div>
                        )}
                    </div>

                    {/* Action Grid */}
                    <div className="p-4 bg-white border-t border-gray-100 grid grid-cols-2 gap-3">
                        <Button
                            onClick={handleVerifyAudit}
                            variant={session.cachedAuditResult && !session.cacheIsDirty ? "secondary" : "tonal"}
                            className="h-12 text-xs"
                            icon={session.cachedAuditResult && !session.cacheIsDirty ? "verified_user" : "policy"}
                        >
                            {session.cachedAuditResult && !session.cacheIsDirty ? 'View Audit' : 'Verify'}
                        </Button>
                        <Button
                            onClick={handlePlanAssembly}
                            variant={session.cachedAssemblyPlan && !session.cacheIsDirty ? "secondary" : "tonal"}
                            className="h-12 text-xs"
                            icon={session.cachedAssemblyPlan && !session.cacheIsDirty ? "precision_manufacturing" : "build"}
                        >
                            {session.cachedAssemblyPlan && !session.cacheIsDirty ? 'View Plan' : 'Plan'}
                        </Button>
                    </div>
                </div>

                {/* Mobile Bottom Navigation Bar */}
                <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-[80px] z-50 px-2 pb-4">
                    <button
                        onClick={() => setMobileTab('draft')}
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 rounded-full ${mobileTab === 'draft' ? 'text-indigo-600' : 'text-slate-500'}`}
                    >
                        <div className={`px-5 py-1 rounded-full transition-colors ${mobileTab === 'draft' ? 'bg-indigo-100' : 'bg-transparent'}`}>
                            <span className="material-symbols-rounded text-[24px]" aria-hidden="true">edit_note</span>
                        </div>
                        <span className="text-[11px] font-bold">Draft</span>
                    </button>
                    <button
                        onClick={() => setMobileTab('bom')}
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 rounded-full ${mobileTab === 'bom' ? 'text-indigo-600' : 'text-slate-500'}`}
                    >
                        <div className={`px-5 py-1 rounded-full transition-colors ${mobileTab === 'bom' ? 'bg-indigo-100' : 'bg-transparent'}`}>
                            <span className="material-symbols-rounded text-[24px]" aria-hidden="true">inventory_2</span>
                        </div>
                        <span className="text-[11px] font-bold">Parts</span>
                    </button>
                </div>

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