import React, { Component, useState, useRef, useEffect, useCallback, ErrorInfo } from 'react';
import heic2any from 'heic2any';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine, ProjectIndexEntry } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { ComponentIdentification } from './services/aiTypes.ts';
import { DraftingSession, UserMessage, User, BOMEntry, Part, AssemblyPlan, EnclosureSpec } from './types.ts';
import { Button, Chip, Card, GoogleSignInButton, IconButton } from './components/Material3UI.tsx';
import { ChiltonVisualizer } from './components/ChiltonVisualizer.tsx';
import { useService } from './contexts/ServiceContext.tsx';
import { ARGuideView } from './components/ARGuideView.tsx';
import { TestSuite, TestResult } from './services/testSuite.ts';
import { CookieConsent } from './components/CookieConsent.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';

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
    onHydrate: (entry: BOMEntry) => void;
    isHydrating?: boolean;
    onUpdateQuantity?: (instanceId: string, qty: number) => void;
    onUpdateName?: (instanceId: string, name: string) => void;
    onRemove?: (instanceId: string) => void;
    allEntries?: BOMEntry[];
    onSetParent?: (instanceId: string, parentInstanceId: string | null) => void;
    onGenerateEnclosure?: (entry: BOMEntry) => void;
    onExportSCAD?: (entry: BOMEntry) => void;
}> = ({ entry, onClose, onSource, onHydrate, isHydrating, onUpdateQuantity, onUpdateName, onRemove, allEntries, onSetParent, onGenerateEnclosure, onExportSCAD }) => {
    const [editName, setEditName] = useState(entry?.part.name || '');
    const [editQty, setEditQty] = useState(entry?.quantity || 1);

    useEffect(() => {
        if (entry) {
            setEditName(entry.part.name);
            setEditQty(entry.quantity);
        }
    }, [entry]);

    if (!entry) return null;
    const isVirtual = entry.part.brand === 'TBD';
    const isOwned = /user owned/i.test(entry.part.description || '');
    const displayDescription = entry.part.description?.replace(/\s*\({0,1}user owned\){0,1}/gi, '').trim() || 'No description provided.';
    return (
        <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="part-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-bold text-xl ${isVirtual ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`} aria-hidden="true">
                            {entry.part.category[0] || 'P'}
                        </div>
                        <div className="flex-1">
                            {onUpdateName ? (
                                <input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onBlur={() => onUpdateName(entry.instanceId, editName)}
                                    className="text-xl font-bold w-full text-slate-800 tracking-tight bg-transparent border-b border-gray-200 outline-none focus:border-indigo-400"
                                    aria-label="Part Name"
                                />
                            ) : (
                                <h3 id="part-title" className="text-xl font-bold text-slate-800 tracking-tight">{entry.part.name}</h3>
                            )}
                            <p className="text-xs text-slate-600 font-medium flex items-center gap-2 mt-1">
                                {entry.part.brand}
                                {isVirtual && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase">Unverified</span>}
                                {isOwned && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">Owned</span>}
                            </p>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close" className="self-start" />
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-6">
                        {isVirtual && (
                            <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-[20px] border border-amber-200">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h4 className="font-bold text-sm text-amber-900 mb-1">Virtual Component</h4>
                                        <p className="text-xs text-amber-700 leading-relaxed">This part was added by the architect but hasn't been verified yet. Search to fill in real specs, pricing, and connectors.</p>
                                    </div>
                                    <Button
                                        onClick={() => onHydrate(entry)}
                                        disabled={isHydrating}
                                        variant="tonal"
                                        className="shrink-0 bg-amber-500 text-white hover:bg-amber-600 border-none shadow-md"
                                        icon={isHydrating ? "progress_activity" : "travel_explore"}
                                    >
                                        {isHydrating ? 'Searching...' : 'Search'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="bg-[#F0F4F9] p-4 rounded-[20px]">
                            <p className="text-sm text-slate-700 leading-relaxed">{displayDescription}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Qty</label>
                                {onUpdateQuantity ? (
                                    <input
                                        type="number" min="1"
                                        value={editQty}
                                        onChange={e => setEditQty(parseInt(e.target.value) || 1)}
                                        onBlur={() => onUpdateQuantity(entry.instanceId, editQty)}
                                        className="w-full text-sm font-bold text-slate-900 mt-1 bg-transparent border-b border-gray-200 outline-none focus:border-indigo-400"
                                        aria-label="Quantity"
                                    />
                                ) : (
                                    <p className="text-sm font-bold text-slate-900 mt-1">{entry.quantity}</p>
                                )}
                            </div>
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">SKU</label>
                                <p className="text-sm font-mono text-slate-900 mt-1 truncate">{entry.part.sku}</p>
                            </div>
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Price</label>
                                <p className="text-sm text-slate-900 mt-1 font-bold">${entry.part.price.toFixed(2)}</p>
                            </div>
                        </div>

                        {entry.part.ports && entry.part.ports.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-rounded text-violet-600 text-[18px]" aria-hidden="true">cable</span>
                                    <label className="text-[11px] font-bold text-violet-900 uppercase tracking-widest">Ports & Connectors</label>
                                </div>
                                <div className="space-y-2">
                                    {entry.part.ports.map((port, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-violet-50 rounded-[12px] border border-violet-100">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-800">{port.name}</span>
                                                <span className="text-[10px] text-violet-600 font-mono">{port.spec}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white text-slate-500 border border-violet-100">{port.type}</span>
                                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white text-slate-500 border border-violet-100">{port.gender}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

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

                        {/* Sub-Assembly Parent */}
                        {onSetParent && allEntries && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-rounded text-teal-600 text-[18px]" aria-hidden="true">account_tree</span>
                                    <label className="text-[11px] font-bold text-teal-900 uppercase tracking-widest">Sub-Assembly</label>
                                </div>
                                <select
                                    value={entry.parentInstanceId || ''}
                                    onChange={e => onSetParent(entry.instanceId, e.target.value || null)}
                                    className="w-full p-3 bg-teal-50 border border-teal-100 rounded-[12px] text-sm focus:ring-2 focus:ring-teal-400 outline-none"
                                    aria-label="Parent assembly"
                                >
                                    <option value="">— Root Level (No Parent) —</option>
                                    {allEntries.filter(e => e.instanceId !== entry.instanceId).map(e => (
                                        <option key={e.instanceId} value={e.instanceId}>{e.part.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Enclosure / CAD */}
                        {(entry as any).enclosure ? (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-rounded text-cyan-600 text-[18px]" aria-hidden="true">deployed_code</span>
                                    <label className="text-[11px] font-bold text-cyan-900 uppercase tracking-widest">Enclosure Design</label>
                                </div>
                                <div className="space-y-3">
                                    {(entry as any).enclosure.description && (
                                        <p className="text-sm text-slate-700 bg-cyan-50 p-4 rounded-[16px] border border-cyan-100">{(entry as any).enclosure.description}</p>
                                    )}
                                    {(entry as any).enclosure.openSCAD && (
                                        <details className="bg-slate-900 rounded-[16px] overflow-hidden">
                                            <summary className="p-3 text-xs font-bold text-cyan-300 cursor-pointer hover:bg-slate-800 transition-colors uppercase tracking-wider flex items-center gap-2">
                                                <span className="material-symbols-rounded text-[16px]" aria-hidden="true">code</span>
                                                OpenSCAD Source
                                            </summary>
                                            <pre className="p-4 pt-0 text-xs text-green-300 font-mono overflow-x-auto max-h-[240px] overflow-y-auto leading-relaxed">{(entry as any).enclosure.openSCAD}</pre>
                                        </details>
                                    )}
                                    {(entry as any).enclosure.renderUrl && (
                                        <div className="rounded-[16px] overflow-hidden border border-cyan-100">
                                            <img src={(entry as any).enclosure.renderUrl} alt="Enclosure render" className="w-full object-contain max-h-[240px] bg-[#F4F7FC]" />
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        {onExportSCAD && (entry as any).enclosure.openSCAD && (
                                            <Button variant="tonal" onClick={() => onExportSCAD(entry)} icon="download" className="flex-1">Download .scad</Button>
                                        )}
                                        {onGenerateEnclosure && (
                                            <Button variant="ghost" onClick={() => onGenerateEnclosure(entry)} icon="refresh" className="flex-1">Regenerate</Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : onGenerateEnclosure ? (
                            <div className="p-5 bg-gradient-to-r from-cyan-50 to-sky-50 rounded-[20px] border border-cyan-200">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h4 className="font-bold text-sm text-cyan-900 mb-1">Text-to-CAD</h4>
                                        <p className="text-xs text-cyan-700 leading-relaxed">Generate a 3D-printable enclosure for this component using AI.</p>
                                    </div>
                                    <Button
                                        onClick={() => onGenerateEnclosure(entry)}
                                        variant="tonal"
                                        className="shrink-0 bg-cyan-500 text-white hover:bg-cyan-600 border-none shadow-md"
                                        icon="deployed_code"
                                    >
                                        Generate
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 flex flex-wrap gap-3 justify-end items-center">
                    {onRemove && (
                        <Button variant="ghost" onClick={() => onRemove(entry.instanceId)} className="mr-auto text-red-600 hover:bg-red-50" icon="delete">Remove</Button>
                    )}
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
    isApplying?: boolean;
    proposedActions?: DraftingSession['cachedAuditActions'];
    onRefresh: () => void;
    onApplyChanges?: () => void;
}> = ({ isOpen, onClose, result, isRunning, isDirty, isApplying, proposedActions, onRefresh, onApplyChanges }) => {
    if (!isOpen) return null;
    const hasActions = proposedActions && proposedActions.length > 0;
    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="audit-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shadow-sm ${isRunning || isApplying ? 'bg-indigo-100 text-indigo-600' : 'bg-teal-100 text-teal-600'}`} aria-hidden="true">
                            <span className={`material-symbols-rounded text-[28px] ${isRunning || isApplying ? 'animate-spin' : ''}`} aria-hidden="true">
                                {isRunning || isApplying ? 'refresh' : 'policy'}
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
                    ) : isApplying ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-6">
                            <div className="relative w-20 h-20">
                                <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-slate-500 font-medium animate-pulse">Applying recommended changes...</p>
                        </div>
                    ) : result ? (
                        <div className="space-y-6">
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <ReactMarkdown>{result}</ReactMarkdown>
                            </div>

                            {/* Structured Changelist */}
                            {hasActions && (
                                <div className="border border-emerald-200 rounded-[20px] overflow-hidden">
                                    <div className="bg-emerald-50 px-5 py-3 flex items-center gap-2">
                                        <span className="material-symbols-rounded text-emerald-600 text-[18px]" aria-hidden="true">checklist</span>
                                        <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">Suggested Changes ({proposedActions!.length})</h4>
                                    </div>
                                    <div className="divide-y divide-emerald-100">
                                        {proposedActions!.map((action, i) => (
                                            <div key={i} className="px-5 py-3 flex items-start gap-3">
                                                <span className={`material-symbols-rounded text-[18px] mt-0.5 shrink-0 ${
                                                    action.type === 'addPart' ? 'text-emerald-600' : 'text-red-500'
                                                }`} aria-hidden="true">
                                                    {action.type === 'addPart' ? 'add_circle' : 'remove_circle'}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800">
                                                        {action.type === 'addPart' ? 'Add' : 'Remove'}: {action.name || action.instanceId}
                                                        {action.category && <span className="text-xs text-slate-400 ml-2">({action.category})</span>}
                                                        {action.quantity && action.quantity > 1 && <span className="text-xs text-slate-400 ml-1">×{action.quantity}</span>}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{action.reason}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 py-10">
                            No audit results available. Run a verification check.
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    {isDirty && (
                        <Button variant="tonal" onClick={onRefresh} disabled={isRunning || isApplying} icon="refresh">Re-Run Audit</Button>
                    )}
                    {hasActions && !isDirty && !isRunning && onApplyChanges && (
                        <Button variant="tonal" onClick={onApplyChanges} disabled={isApplying} className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100" icon="auto_fix_high">Apply Recommended Changes</Button>
                    )}
                    <Button variant="primary" onClick={onClose} disabled={isApplying}>Done</Button>
                </div>
            </div>
        </div>
    );
};

// --- DELETE CONFIRMATION DIALOG ---
const DeleteConfirmDialog: React.FC<{
    isOpen: boolean;
    projectName: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ isOpen, projectName, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="bg-white rounded-[28px] shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-rounded text-red-500 text-[32px]" aria-hidden="true">delete_forever</span>
                    </div>
                    <h3 id="delete-title" className="text-lg font-bold text-slate-800 mb-2">Delete Project?</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        <strong className="text-slate-800">{projectName || 'Untitled Draft'}</strong> will be permanently deleted. This action cannot be undone.
                    </p>
                </div>
                <div className="px-6 pb-6 flex gap-3">
                    <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
                    <Button variant="primary" onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700" icon="delete">Delete</Button>
                </div>
            </div>
        </div>
    );
};

// --- SCAN PART MODAL (Visual Parts Audit) ---
const ScanPartModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    result: ComponentIdentification | null;
    isScanning: boolean;
    onScan: (image: string) => void;
    onAddToBOM: (result: ComponentIdentification) => void;
}> = ({ isOpen, onClose, result, isScanning, onScan, onAddToBOM }) => {
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        let processFile = file;
        const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
        if (isHeic) {
            try {
                const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
                const blobArray = Array.isArray(convertedBlob) ? convertedBlob : [convertedBlob];
                processFile = new File([blobArray[0]], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: "image/jpeg" });
            } catch (err) { console.error("HEIC conversion failed:", err); }
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            setPreviewImage(dataUrl);
            onScan(dataUrl);
        };
        reader.readAsDataURL(processFile);
        e.target.value = '';
    };

    const conditionColor = (c: string) => {
        switch (c) {
            case 'Excellent': return 'text-emerald-700 bg-emerald-50';
            case 'Good': return 'text-blue-700 bg-blue-50';
            case 'Fair': return 'text-amber-700 bg-amber-50';
            case 'Poor': return 'text-red-700 bg-red-50';
            default: return 'text-slate-700 bg-slate-50';
        }
    };

    return (
        <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="scan-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-[14px] bg-violet-100 text-violet-600 flex items-center justify-center" aria-hidden="true">
                            <span className="material-symbols-rounded text-[24px]">photo_camera</span>
                        </div>
                        <div>
                            <h3 id="scan-title" className="text-lg font-bold text-slate-800 tracking-tight">Visual Parts Audit</h3>
                            <p className="text-xs text-slate-500 font-medium">AI Component Identification</p>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={() => { setPreviewImage(null); onClose(); }} title="Close" />
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* Upload Area */}
                    {!previewImage && !isScanning && !result && (
                        <label className="block cursor-pointer">
                            <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleFileSelect} />
                            <div className="border-2 border-dashed border-violet-200 rounded-[24px] p-10 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-all">
                                <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-4">
                                    <span className="material-symbols-rounded text-violet-400 text-[32px]">add_a_photo</span>
                                </div>
                                <p className="text-sm font-bold text-slate-700 mb-1">Upload a photo of your component</p>
                                <p className="text-xs text-slate-500">Gemini will identify it, assess condition, and suggest a BOM entry</p>
                            </div>
                        </label>
                    )}

                    {/* Preview + Loading */}
                    {previewImage && (
                        <div className="rounded-[20px] overflow-hidden border border-gray-100">
                            <img src={previewImage} alt="Component photo" className="w-full max-h-[200px] object-contain bg-[#F4F7FC]" />
                        </div>
                    )}

                    {isScanning && (
                        <div className="flex flex-col items-center py-8 space-y-4">
                            <div className="relative w-16 h-16">
                                <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-sm text-slate-500 font-medium animate-pulse">Analyzing component...</p>
                        </div>
                    )}

                    {/* Result */}
                    {result && !isScanning && (
                        <div className="space-y-4">
                            <div className="p-5 bg-[#F0F4F9] rounded-[20px]">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h4 className="font-bold text-lg text-slate-800">{result.name}</h4>
                                        <p className="text-xs text-slate-500">{result.brand} · {result.category}</p>
                                    </div>
                                    <span className={`text-[11px] font-bold uppercase px-3 py-1 rounded-full ${conditionColor(result.condition)}`}>
                                        {result.condition}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed">{result.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 border border-gray-100 rounded-[16px]">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Est. Price</label>
                                    <p className="text-lg font-bold text-slate-900 mt-1">${result.estimatedPrice.toFixed(2)}</p>
                                </div>
                                <div className="p-4 border border-gray-100 rounded-[16px]">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Part ID</label>
                                    <p className="text-sm font-mono text-slate-700 mt-1 truncate">{result.suggestedPartId}</p>
                                </div>
                            </div>

                            {result.conditionNotes && (
                                <div className="p-4 bg-amber-50 rounded-[16px] border border-amber-100">
                                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Condition Notes</p>
                                    <p className="text-sm text-amber-900">{result.conditionNotes}</p>
                                </div>
                            )}

                            {result.defects.length > 0 && (
                                <div className="p-4 bg-red-50 rounded-[16px] border border-red-100">
                                    <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-2">Defects Detected</p>
                                    <ul className="space-y-1">
                                        {result.defects.map((d, i) => (
                                            <li key={i} className="text-sm text-red-800 flex items-start gap-2">
                                                <span className="material-symbols-rounded text-[14px] mt-0.5 text-red-500" aria-hidden="true">warning</span>
                                                {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {result.ports.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold text-violet-900 uppercase tracking-widest mb-2">Detected Ports</p>
                                    <div className="space-y-1">
                                        {result.ports.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between p-2.5 bg-violet-50 rounded-[10px] text-sm">
                                                <span className="font-medium text-slate-800">{p.name}</span>
                                                <div className="flex gap-1">
                                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white text-slate-500">{p.type}</span>
                                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white text-slate-500">{p.gender}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex gap-3">
                    {result && !isScanning ? (
                        <>
                            <Button variant="ghost" onClick={() => { setPreviewImage(null); }} className="flex-1" icon="add_a_photo">Scan Another</Button>
                            <Button variant="primary" onClick={() => onAddToBOM(result)} className="flex-1" icon="add_circle">Add to BOM</Button>
                        </>
                    ) : (
                        <Button variant="ghost" onClick={() => { setPreviewImage(null); onClose(); }} className="flex-1">Cancel</Button>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- PORT WARNINGS PANEL ---
const PortWarningsPanel: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    warnings: { partA: string; partB: string; portA: string; portB: string; issue: string }[];
}> = ({ isOpen, onClose, warnings }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[90] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="warnings-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-[14px] bg-amber-100 text-amber-600 flex items-center justify-center" aria-hidden="true">
                            <span className="material-symbols-rounded text-[24px]">cable</span>
                        </div>
                        <div>
                            <h3 id="warnings-title" className="text-lg font-bold text-slate-800 tracking-tight">Port Compatibility</h3>
                            <p className="text-xs text-slate-500 font-medium">{warnings.length} issue{warnings.length !== 1 ? 's' : ''} detected</p>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close" />
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {warnings.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                                <span className="material-symbols-rounded text-emerald-500 text-[28px]" aria-hidden="true">check_circle</span>
                            </div>
                            <p className="text-sm font-medium text-slate-600">All ports are compatible!</p>
                        </div>
                    ) : (
                        warnings.map((w, i) => (
                            <div key={i} className="p-4 bg-amber-50 rounded-[16px] border border-amber-100">
                                <div className="flex items-start gap-2 mb-1">
                                    <span className="material-symbols-rounded text-amber-500 text-[18px] mt-0.5 shrink-0" aria-hidden="true">warning</span>
                                    <p className="text-sm font-bold text-amber-900">{w.issue}</p>
                                </div>
                                <div className="ml-6 text-xs text-amber-700 space-y-0.5">
                                    <p><strong>{w.partA}</strong> → {w.portA}</p>
                                    {w.partB !== '(none)' && <p><strong>{w.partB}</strong> → {w.portB}</p>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end">
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
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [auditOpen, setAuditOpen] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isApplyingAudit, setIsApplyingAudit] = useState(false);

    const [selectedPart, setSelectedPart] = useState<BOMEntry | null>(null);
    const [assemblyOpen, setAssemblyOpen] = useState(false);
    const [isPlanningAssembly, setIsPlanningAssembly] = useState(false);
    const [arOpen, setArOpen] = useState(false);
    const [isVisualizing, setIsVisualizing] = useState(false);
    const [isKitting, setIsKitting] = useState(false);
    const [kitSummaryOpen, setKitSummaryOpen] = useState(false);
    const [isHydrating, setIsHydrating] = useState(false);

    const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [projectsList, setProjectsList] = useState<ProjectIndexEntry[]>([]);

    // Editable Title State
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitleValue, setEditTitleValue] = useState(session.name || '');
    const [shareToast, setShareToast] = useState(false);

    // Mobile State
    const [mobileTab, setMobileTab] = useState<'draft' | 'bom'>('draft');

    // Validation State
    const [validationOpen, setValidationOpen] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [validationResults, setValidationResults] = useState<TestResult[]>([]);

    // Delete Confirmation State
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string>('');
    const [deleteTargetName, setDeleteTargetName] = useState<string>('');

    // Visual Audit (Scan Part) State
    const [scanPartOpen, setScanPartOpen] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<ComponentIdentification | null>(null);

    // Port Warnings State
    const [portWarningsOpen, setPortWarningsOpen] = useState(false);

    // Sub-assembly collapsed state
    const [collapsedAssemblies, setCollapsedAssemblies] = useState<Set<string>>(new Set());

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session.messages, mobileTab, isThinking]);

    // Undo/Redo keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (draftingEngine.canUndo()) {
                    draftingEngine.undo();
                    refreshState();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault();
                if (draftingEngine.canRedo()) {
                    draftingEngine.redo();
                    refreshState();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [draftingEngine]);

    const refreshState = () => {
        setSession(draftingEngine.getSession());
        setProjectsList(draftingEngine.getProjectsList());
    };

    useEffect(() => {
        setProjectsList(draftingEngine.getProjectsList());
        
        // Listen for async image loading from IndexedDB
        draftingEngine.setOnImagesLoaded(() => {
            setSession(draftingEngine.getSession());
        });
    }, [draftingEngine]);

    const triggerArchitectRevalidation = async () => {
        draftingEngine.addMessage({ role: 'assistant', content: "**System:** Manual BOM edit detected. Triggering Architect re-validation for constraints (836cc engine).", timestamp: new Date() });
        refreshState();
        try {
            const history = draftingEngine.getSession().messages.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));
            const architectResponse = await aiService.askArchitect("A manual edit occurred. Re-validate the active BOM layout and state to check for kinematic or thermal conflicts against the 836cc engine constraints. Be brief in your analysis.", history);
            const parsed = aiService.parseArchitectResponse(architectResponse.text);
            
            draftingEngine.addMessage({ 
                role: 'assistant', 
                content: parsed.reasoning || architectResponse.text, 
                timestamp: new Date()
            });
        } catch (e: any) {
            draftingEngine.addMessage({ role: 'assistant', content: `[VALIDATION ERROR] ${e.message}`, timestamp: new Date() });
        } finally {
            refreshState();
        }
    };

    const handleUpdateQuantity = (instanceId: string, qty: number) => {
        draftingEngine.updatePartQuantity(instanceId, qty);
        refreshState();
        triggerArchitectRevalidation();
    };

    const handleUpdateName = (instanceId: string, name: string) => {
        draftingEngine.updatePartDetails(instanceId, { name });
        refreshState();
        triggerArchitectRevalidation();
    };

    const handleRemovePart = (instanceId: string) => {
        draftingEngine.removePart(instanceId);
        if (selectedPart?.instanceId === instanceId) setSelectedPart(null);
        refreshState();
        triggerArchitectRevalidation();
    };

    const handleAddCustomPart = () => {
        const id = "custom-part-" + Math.random().toString(36).substr(2, 5);
        draftingEngine.addPart(id, "New Custom Part", "Custom Component", 1);
        refreshState();
        triggerArchitectRevalidation();
    };

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

    const handleHydratePart = async (entry: BOMEntry) => {
        if (!aiService.hydratePartDetails || isHydrating) return;
        setIsHydrating(true);
        try {
            const details = await aiService.hydratePartDetails(entry.part.name, entry.part.category);
            if (details) {
                draftingEngine.updatePartDetails(entry.instanceId, details);
                refreshState();
                // Re-select the part to show updated data in the modal
                const updatedSession = draftingEngine.getSession();
                const updatedEntry = updatedSession.bom.find(b => b.instanceId === entry.instanceId);
                if (updatedEntry) setSelectedPart(updatedEntry);
            }
        } catch (e) {
            console.error('Hydration failed:', e);
        } finally {
            setIsHydrating(false);
        }
    };

    const hydrateAllVirtualParts = async () => {
        if (!aiService.hydratePartDetails) return;
        const latestSession = draftingEngine.getSession();
        const virtualParts = latestSession.bom.filter(b => b.part.brand === 'TBD');
        if (virtualParts.length === 0) return;

        // Process in batches of 3 for speed
        for (let i = 0; i < virtualParts.length; i += 3) {
            const batch = virtualParts.slice(i, i + 3);
            await Promise.all(batch.map(async (entry) => {
                try {
                    const details = await aiService.hydratePartDetails!(entry.part.name, entry.part.category);
                    if (details) {
                        draftingEngine.updatePartDetails(entry.instanceId, details);
                    }
                } catch (e) {
                    console.error(`Hydration failed for ${entry.part.name}:`, e);
                }
            }));
        }
        refreshState();
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
            // Hydrate all virtual parts before running audit
            await hydrateAllVirtualParts();
            const latestSession = draftingEngine.getSession();
            const res = await aiService.verifyDesign(latestSession.bom, latestSession.designRequirements, latestSession.cachedAuditResult);
            draftingEngine.cacheAuditResult(res.reasoning);

            // Use actions from verifyDesign response (single API call approach)
            if (res.auditActions && res.auditActions.length > 0) {
                draftingEngine.cacheAuditActions(res.auditActions);
            } else if (aiService.applyAuditRecommendations) {
                // Fallback: separate API call if verifyDesign didn't return actions
                try {
                    const freshSession = draftingEngine.getSession();
                    const { actions } = await aiService.applyAuditRecommendations(
                        freshSession.bom,
                        res.reasoning,
                        freshSession.designRequirements
                    );
                    draftingEngine.cacheAuditActions(actions);
                } catch (e) {
                    console.error('Failed to pre-compute audit actions:', e);
                }
            }

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

    const performVisualGeneration = async (customPrompt?: string) => {
        const currentSession = draftingEngine.getSession();
        if (isVisualizing || currentSession.bom.length === 0) return;
        setIsVisualizing(true);
        try {
            const requirements = customPrompt || currentSession.designRequirements || currentSession.name || "Hardware assembly";
            const imageUrl = await aiService.generateProductImage(requirements);
            if (imageUrl) {
                const promptLabel = customPrompt ? customPrompt : `Design concept for: ${requirements}`;
                draftingEngine.addGeneratedImage(imageUrl, promptLabel);
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
        draftingEngine.addMessage({ role: 'assistant', content: "🚀 **One-Click Stabilization Initiated.**\nI'm hydrating virtual parts, finding vendors, syncronizing pricing, and performing a heavy-reasoner technical audit.", timestamp: new Date() });
        refreshState();

        try {
            // Hydrate all virtual parts first (Google Search grounding)
            await hydrateAllVirtualParts();
            draftingEngine.addMessage({ role: 'assistant', content: "🔬 **Parts hydrated.** Real-world specs and pricing applied to all virtual components.", timestamp: new Date() });
            refreshState();

            // Re-fetch latest session after hydration
            latestSession = draftingEngine.getSession();
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

    const handleApplyAuditChanges = async () => {
        const currentSession = draftingEngine.getSession();
        const actions = currentSession.cachedAuditActions;
        if (!actions || actions.length === 0) return;

        setIsApplyingAudit(true);
        try {
            let changesApplied = 0;
            actions.forEach(action => {
                if (action.type === 'addPart' && action.partId && action.name && action.category) {
                    draftingEngine.addPart(action.partId, action.name, action.category, action.quantity || 1);
                    changesApplied++;
                } else if (action.type === 'removePart' && action.instanceId) {
                    draftingEngine.removePart(action.instanceId);
                    changesApplied++;
                }
            });

            if (changesApplied > 0) {
                const actionDetails = actions.map(a => `- **${a.type === 'addPart' ? 'Added' : 'Removed'}**: ${a.name || a.instanceId} — ${a.reason}`).join('\n');
                draftingEngine.addMessage({
                    role: 'assistant',
                    content: `✅ **Applied ${changesApplied} recommended change${changesApplied > 1 ? 's' : ''}.**\n${actionDetails}`,
                    timestamp: new Date()
                });
                refreshState();

                // Hydrate new parts and source them
                await hydrateAllVirtualParts();
                const updatedSession = draftingEngine.getSession();
                for (const entry of updatedSession.bom) {
                    if (entry.sourcing?.online === undefined) {
                        await handleSourcePart(entry);
                    }
                }
            } else {
                draftingEngine.addMessage({
                    role: 'assistant',
                    content: '✅ **No actionable changes could be applied.** The suggested changes may already be reflected in the BOM.',
                    timestamp: new Date()
                });
            }

            refreshState();
            setAuditOpen(false);
        } catch (e: any) {
            console.error('Failed to apply audit changes:', e);
            draftingEngine.addMessage({
                role: 'assistant',
                content: `⚠️ **Failed to apply changes:** ${e.message}`,
                timestamp: new Date()
            });
            refreshState();
        } finally {
            setIsApplyingAudit(false);
        }
    };

    const handlePlanAssembly = async () => {
        const currentSession = draftingEngine.getSession();
        if (currentSession.cachedAssemblyPlan && !currentSession.cacheIsDirty) {
            setAssemblyOpen(true);
            return;
        }
        await performPlanAssembly();
    };

    const handleGenerateVisual = async (customPrompt?: string) => {
        await performVisualGeneration(customPrompt);
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

    const handleExportCSV = () => {
        const csv = draftingEngine.exportCSV();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `buildsheet-bom-${session.id}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPDF = () => {
        // Create a print-optimized view
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const totalCost = draftingEngine.getTotalCost();
        const bomRows = session.bom.map(entry => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${entry.part.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 12px;">${entry.part.sku}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${entry.part.category}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${entry.part.brand}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${entry.quantity}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${entry.part.price.toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${(entry.part.price * entry.quantity).toFixed(2)}</td>
            </tr>
        `).join('');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>${session.name} — BuildSheet BOM</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1f1f1f; max-width: 900px; margin: 0 auto; }
                h1 { font-size: 24px; margin-bottom: 4px; }
                .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
                table { width: 100%; border-collapse: collapse; }
                th { padding: 10px 8px; text-align: left; border-bottom: 2px solid #1f1f1f; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
                .total-row td { border-top: 2px solid #1f1f1f; font-weight: bold; padding-top: 12px; }
                @media print { body { padding: 20px; } }
            </style></head><body>
            <h1>${session.name || 'Untitled Draft'}</h1>
            <p class="meta">${session.bom.length} components · Exported ${new Date().toLocaleDateString()} · BuildSheet</p>
            ${session.designRequirements ? `<p style="color: #444; font-size: 14px; margin-bottom: 20px; padding: 12px; background: #f8fafc; border-radius: 8px;">${session.designRequirements}</p>` : ''}
            <table>
                <thead><tr>
                    <th>Component</th><th>SKU</th><th>Category</th><th>Brand</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th>
                </tr></thead>
                <tbody>${bomRows}
                <tr class="total-row">
                    <td colspan="6" style="text-align: right; padding: 12px 8px;">Total Estimate</td>
                    <td style="text-align: right; padding: 12px 8px; font-size: 18px;">$${totalCost.toFixed(2)}</td>
                </tr></tbody>
            </table>
        </body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    // Visual Audit Handlers
    const handleScanPart = async (image: string) => {
        if (!aiService.identifyComponent) return;
        setIsScanning(true);
        setScanResult(null);
        try {
            const result = await aiService.identifyComponent(image);
            setScanResult(result);
        } catch (e) {
            console.error('Component scan failed:', e);
        } finally {
            setIsScanning(false);
        }
    };

    const handleAddFromScan = (result: ComponentIdentification) => {
        draftingEngine.addPart(
            result.suggestedPartId,
            result.name,
            result.category,
            1
        );
        // Update with full details
        const latestSession = draftingEngine.getSession();
        const newEntry = latestSession.bom.find(b => b.part.id === result.suggestedPartId);
        if (newEntry) {
            draftingEngine.updatePartDetails(newEntry.instanceId, {
                brand: result.brand,
                description: result.description + (result.condition !== 'Unknown' ? ` (Condition: ${result.condition})` : ''),
                price: result.estimatedPrice,
                ports: result.ports.map((p, i) => ({
                    id: `port-${i}`,
                    name: p.name,
                    type: p.type as any,
                    gender: p.gender as any,
                    spec: p.spec
                }))
            });
        }
        refreshState();
        setScanPartOpen(false);
        setScanResult(null);
        draftingEngine.addMessage({
            role: 'assistant',
            content: `📷 **Visual Parts Audit:** Identified **${result.name}** (${result.brand}). Condition: **${result.condition}**. Added to BOM at $${result.estimatedPrice.toFixed(2)}.${result.defects.length > 0 ? `\n⚠️ Defects: ${result.defects.join(', ')}` : ''}`,
            timestamp: new Date()
        });
        refreshState();
    };

    // Delete confirmation wrapper
    const handleDeleteWithConfirm = (id: string) => {
        const project = projectsList.find(p => p.id === id);
        setDeleteTargetId(id);
        setDeleteTargetName(project?.name || '');
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        draftingEngine.deleteProject(deleteTargetId);
        refreshState();
        setDeleteConfirmOpen(false);
    };

    // Sub-assembly handlers
    const handleSetParent = (instanceId: string, parentInstanceId: string | null) => {
        draftingEngine.setParent(instanceId, parentInstanceId);
        refreshState();
    };

    const toggleCollapse = (instanceId: string) => {
        setCollapsedAssemblies(prev => {
            const next = new Set(prev);
            if (next.has(instanceId)) next.delete(instanceId);
            else next.add(instanceId);
            return next;
        });
    };

    // Enclosure handlers
    const handleGenerateEnclosure = async (entry: BOMEntry) => {
        if (!aiService.generateEnclosure) return;
        const context = `${session.name}: ${session.designRequirements || 'Hardware assembly'}`;
        const spec = await aiService.generateEnclosure(context, session.bom);
        if (spec) {
            const updatedBom = session.bom.map(b =>
                b.instanceId === entry.instanceId ? { ...b, enclosure: spec } : b
            );
            // Directly update session BOM with enclosure
            const currentSession = draftingEngine.getSession();
            const entryToUpdate = currentSession.bom.find(b => b.instanceId === entry.instanceId);
            if (entryToUpdate) {
                (entryToUpdate as any).enclosure = spec;
            }
            refreshState();
            // Re-select the part to show enclosure in modal
            const updatedEntry = draftingEngine.getSession().bom.find(b => b.instanceId === entry.instanceId);
            if (updatedEntry) setSelectedPart(updatedEntry);
        }
    };

    const handleExportSCAD = (entry: BOMEntry) => {
        if (!entry.enclosure?.openSCAD) return;
        const blob = new Blob([entry.enclosure.openSCAD], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${entry.part.name.replace(/\s+/g, '-').toLowerCase()}-enclosure.scad`;
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
        
        const currentInput = input;
        const currentImage = selectedImage;
        
        draftingEngine.addMessage({ role: 'user', content: currentInput, attachment: currentImage || undefined, timestamp: new Date() });
        refreshState();
        setInput('');
        setSelectedImage(null);
        setIsThinking(true);
        try {
            // Fix: Map 'assistant' role to 'model' for Gemini API compatibility
            const history = session.messages.map(m => {
                const parts: any[] = [{ text: m.content }];
                if (m.attachment) {
                    const matches = m.attachment.match(/^data:(.+?);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
                    }
                }
                return {
                    role: m.role === 'user' ? 'user' : 'model',
                    parts
                };
            });
            const startTime = Date.now();
            const architectResponse = await aiService.askArchitect(currentInput, history, currentImage || undefined);
            const latencyMs = Date.now() - startTime;
            const parsed = aiService.parseArchitectResponse(architectResponse.text);

            let stateModified = false;
            parsed.toolCalls.forEach(call => {
                if (call.type === 'initializeDraft') { draftingEngine.initialize(call.name, call.reqs); stateModified = true; }
                else if (call.type === 'addPart') { draftingEngine.addPart(call.partId, call.name, call.category, call.qty); stateModified = true; }
                else if (call.type === 'removePart') { draftingEngine.removePart(call.instanceId); stateModified = true; }
            });

            draftingEngine.addMessage({ 
                role: 'assistant', 
                content: parsed.reasoning || architectResponse.text, 
                timestamp: new Date(),
                metadata: {
                    ...architectResponse.metadata,
                    latencyMs
                }
            });
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
                onDelete={handleDeleteWithConfirm}
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
            <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} result={session.cachedAuditResult || null} isRunning={isAuditing} isDirty={session.cacheIsDirty} isApplying={isApplyingAudit} proposedActions={session.cachedAuditActions} onRefresh={() => performVerifyAudit()} onApplyChanges={handleApplyAuditChanges} />
            <PartDetailModal 
                entry={selectedPart} 
                onClose={() => setSelectedPart(null)} 
                onSource={handleSourcePart} 
                onHydrate={handleHydratePart} 
                isHydrating={isHydrating} 
                onUpdateQuantity={handleUpdateQuantity}
                onUpdateName={handleUpdateName}
                onRemove={handleRemovePart}
                allEntries={session.bom}
                onSetParent={handleSetParent}
                onGenerateEnclosure={handleGenerateEnclosure}
                onExportSCAD={handleExportSCAD}
            />
            {arOpen && session.cachedAssemblyPlan && <ARGuideView plan={session.cachedAssemblyPlan} aiService={aiService} onClose={() => setArOpen(false)} />}

            <DeleteConfirmDialog isOpen={deleteConfirmOpen} projectName={deleteTargetName} onConfirm={confirmDelete} onCancel={() => setDeleteConfirmOpen(false)} />
            <ScanPartModal isOpen={scanPartOpen} onClose={() => { setScanPartOpen(false); setScanResult(null); }} result={scanResult} isScanning={isScanning} onScan={handleScanPart} onAddToBOM={handleAddFromScan} />
            <PortWarningsPanel isOpen={portWarningsOpen} onClose={() => setPortWarningsOpen(false)} warnings={draftingEngine.getPortWarnings()} />

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
                        title="Export JSON"
                    />
                    <IconButton
                        icon="table_view"
                        onClick={handleExportCSV}
                        className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        title="Export CSV"
                    />
                    <IconButton
                        icon="picture_as_pdf"
                        onClick={handleExportPDF}
                        className="text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                        title="Export PDF"
                    />

                    <div className="w-8 h-[1px] bg-gray-200 my-1"></div>

                    <IconButton
                        icon="photo_camera"
                        onClick={() => setScanPartOpen(true)}
                        className="text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                        title="Scan Part"
                    />
                </div>

                <div className="pb-2">
                    <IconButton icon="tune" title="Settings" onClick={() => setIsSettingsOpen(true)} />
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

                        <div className="flex flex-col flex-1 min-w-0">
                            {isEditingTitle ? (
                                <input
                                    id="project-title-input"
                                    autoFocus
                                    value={editTitleValue}
                                    onChange={e => setEditTitleValue(e.target.value)}
                                    onBlur={() => {
                                        draftingEngine.updateSessionName(editTitleValue);
                                        refreshState();
                                        setIsEditingTitle(false);
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            draftingEngine.updateSessionName(editTitleValue);
                                            refreshState();
                                            setIsEditingTitle(false);
                                        } else if (e.key === 'Escape') {
                                            setEditTitleValue(session.name);
                                            setIsEditingTitle(false);
                                        }
                                    }}
                                    className="font-bold text-lg md:text-xl tracking-tight text-slate-800 bg-transparent border-b-2 border-indigo-400 outline-none w-full py-0.5"
                                    aria-label="Edit project name"
                                />
                            ) : (
                                <h1
                                    className="font-bold text-lg md:text-xl tracking-tight text-slate-800 truncate cursor-pointer hover:text-indigo-600 transition-colors group/title"
                                    onClick={() => { setEditTitleValue(session.name); setIsEditingTitle(true); }}
                                    title="Click to edit project name"
                                >
                                    {session.name || "Untitled Draft"}
                                    <span className="material-symbols-rounded text-[14px] text-slate-300 group-hover/title:text-indigo-400 ml-1.5 align-middle transition-colors" aria-hidden="true">edit</span>
                                </h1>
                            )}
                            <span className="text-xs text-slate-500 font-medium tracking-wide">BuildSheet Drafting Engine</span>
                        </div>

                        <div className="flex gap-2 items-center shrink-0 ml-3">
                            <div className="relative">
                                <IconButton
                                    icon="share"
                                    title="Copy share link"
                                    onClick={() => {
                                        const url = window.location.origin + draftingEngine.getShareUrl();
                                        navigator.clipboard.writeText(url).then(() => {
                                            setShareToast(true);
                                            setTimeout(() => setShareToast(false), 2000);
                                        });
                                    }}
                                    className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                                />
                                {shareToast && (
                                    <div className="absolute top-full right-0 mt-2 bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-top-1 duration-200 z-30">
                                        Link Copied!
                                    </div>
                                )}
                            </div>
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
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300 group`}>
                                <div className={`
                        max-w-[85%] text-sm leading-relaxed shadow-sm flex flex-col relative
                        ${m.role === 'user'
                                        ? 'bg-[#4F5DFF] text-white rounded-[24px] rounded-br-[4px]'
                                        : 'bg-[#F2F6FC] text-[#1F1F1F] rounded-[24px] rounded-bl-[4px] border border-white'}
                    `}>
                                    <div className={`px-6 py-4 prose prose-sm max-w-none ${m.role === 'user' ? 'prose-invert' : 'prose-slate'}`}>
                                        {m.attachment && (
                                            <div className="mb-3">
                                                <img src={m.attachment} alt="Uploaded attachment" className="max-w-full sm:max-w-xs rounded-[12px] border border-white/20 shadow-sm" />
                                            </div>
                                        )}
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                    {m.role === 'user' && (
                                        <div className="absolute top-full right-0 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-2 pr-2 z-10 items-center">
                                            <button onClick={() => { 
                                                draftingEngine.revertToMessage(i - 1); 
                                                setInput(m.content);
                                                refreshState(); 
                                            }} title="Edit message" className="text-indigo-400 hover:text-indigo-600 bg-white/90 backdrop-blur-sm shadow-sm border border-slate-200 p-1.5 flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                                <span className="material-symbols-rounded text-[14px]" aria-hidden="true">edit</span>
                                            </button>
                                        </div>
                                    )}
                                    {m.role === 'assistant' && (
                                        <div className="absolute top-full left-0 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-2 pl-2 z-10 items-center">
                                            {i < session.messages.length - 1 && (
                                                <button onClick={() => { draftingEngine.revertToMessage(i); refreshState(); }} title="Revert to here" className="text-slate-400 hover:text-rose-500 bg-white shadow-sm border border-slate-100 p-1.5 flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500">
                                                    <span className="material-symbols-rounded text-[14px]" aria-hidden="true">restore</span>
                                                </button>
                                            )}
                                            <button onClick={() => { 
                                                const newId = draftingEngine.forkFromMessage(i); 
                                                draftingEngine.loadProject(newId); 
                                                refreshState(); 
                                            }} title="Fork from here" className="text-slate-400 hover:text-indigo-600 bg-white shadow-sm border border-slate-100 p-1.5 flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                                <span className="material-symbols-rounded text-[14px]" aria-hidden="true">call_split</span>
                                            </button>
                                            
                                            {m.metadata && (
                                                <div className="flex bg-white/80 backdrop-blur-sm border border-slate-200/50 shadow-sm rounded-full px-3 py-1 items-center gap-3 text-[10px] text-slate-500 font-mono ml-1">
                                                    {m.metadata.model && (
                                                        <span className="flex items-center gap-1" title="Model Used">
                                                            <span className="material-symbols-rounded text-[12px] text-indigo-400" aria-hidden="true">memory</span>
                                                            {m.metadata.model.replace('gemini-', '')}
                                                        </span>
                                                    )}
                                                    {m.metadata.tokens !== undefined && (
                                                        <span className="flex items-center gap-1" title="Tokens Processed">
                                                            <span className="material-symbols-rounded text-[12px] text-emerald-400" aria-hidden="true">segment</span>
                                                            {m.metadata.tokens}
                                                        </span>
                                                    )}
                                                    {m.metadata.latencyMs !== undefined && (
                                                        <span className="flex items-center gap-1" title="Processing Time">
                                                            <span className="material-symbols-rounded text-[12px] text-amber-400" aria-hidden="true">timer</span>
                                                            {(m.metadata.latencyMs / 1000).toFixed(1)}s
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                        {selectedImage && (
                            <div className="mb-3 relative inline-block p-1 bg-white border border-gray-200 rounded-xl shadow-sm">
                                <img src={selectedImage} alt="Upload preview" className="w-16 h-16 object-cover rounded-lg" />
                                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-slate-700 shadow-sm" title="Remove image">
                                    <span className="material-symbols-rounded text-[14px]">close</span>
                                </button>
                            </div>
                        )}
                        <div className="relative bg-[#F2F6FC] rounded-[32px] transition-all hover:bg-[#EBF1F8] focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 focus-within:shadow-md flex items-center">
                            <input 
                                type="file" 
                                accept="image/*,.heic,.heif,image/heic,image/heif" 
                                className="hidden" 
                                id="image-upload" 
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setIsThinking(true);
                                        let processFile = file;
                                        const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
                                        
                                        if (isHeic) {
                                            try {
                                                const convertedBlob = await heic2any({
                                                    blob: file,
                                                    toType: "image/jpeg",
                                                    quality: 0.8
                                                });
                                                const blobArray = Array.isArray(convertedBlob) ? convertedBlob : [convertedBlob];
                                                processFile = new File([blobArray[0]], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: "image/jpeg" });
                                            } catch (err) {
                                                console.error("HEIC conversion failed:", err);
                                            }
                                        }

                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            setSelectedImage(reader.result as string);
                                            setIsThinking(false);
                                        };
                                        reader.readAsDataURL(processFile);
                                    }
                                    e.target.value = '';
                                }} 
                            />
                            <label 
                                htmlFor="image-upload" 
                                className="w-12 h-12 ml-1 text-slate-400 hover:text-indigo-600 rounded-full flex items-center justify-center transition-all cursor-pointer hover:bg-white shrink-0"
                                title="Upload image"
                            >
                                <span className="material-symbols-rounded">image</span>
                            </label>
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder="Instruct Gemini to build..."
                                aria-label="Instruct Gemini to build"
                                className="w-full pr-14 py-4 bg-transparent border-none text-slate-800 resize-none outline-none placeholder:text-slate-500"
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
                            <div className="flex flex-col items-end gap-2">
                                <Button variant="ghost" onClick={handleAddCustomPart} className="text-xs bg-indigo-50 text-indigo-700 h-8" icon="add">Custom Part</Button>
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

                    {/* BOM Toolbar */}
                    <div className="px-4 pt-3 pb-1 flex gap-2 items-center">
                        <IconButton
                            icon="undo"
                            onClick={() => { draftingEngine.undo(); refreshState(); }}
                            title="Undo (Ctrl+Z)"
                            className={`text-slate-400 ${draftingEngine.canUndo() ? 'hover:text-slate-700 hover:bg-slate-100' : 'opacity-30 cursor-not-allowed'}`}
                        />
                        <IconButton
                            icon="redo"
                            onClick={() => { draftingEngine.redo(); refreshState(); }}
                            title="Redo (Ctrl+Shift+Z)"
                            className={`text-slate-400 ${draftingEngine.canRedo() ? 'hover:text-slate-700 hover:bg-slate-100' : 'opacity-30 cursor-not-allowed'}`}
                        />
                        <div className="flex-1" />
                        {(() => {
                            const warnings = draftingEngine.getPortWarnings();
                            return warnings.length > 0 ? (
                                <button
                                    onClick={() => setPortWarningsOpen(true)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors"
                                    title={`${warnings.length} port compatibility issue${warnings.length !== 1 ? 's' : ''}`}
                                >
                                    <span className="material-symbols-rounded text-[14px]" aria-hidden="true">warning</span>
                                    {warnings.length} Port Issue{warnings.length !== 1 ? 's' : ''}
                                </button>
                            ) : session.bom.some(b => b.part.ports?.length > 0) ? (
                                <button
                                    onClick={() => setPortWarningsOpen(true)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors"
                                    title="All ports compatible"
                                >
                                    <span className="material-symbols-rounded text-[14px]" aria-hidden="true">check_circle</span>
                                    Ports OK
                                </button>
                            ) : null;
                        })()}
                    </div>

                    {/* Parts List — Recursive Tree */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {(() => {
                            const rootParts = session.bom.filter(b => !b.parentInstanceId);
                            const childrenOf = (parentId: string) => session.bom.filter(b => b.parentInstanceId === parentId);

                            const renderEntry = (entry: BOMEntry, depth: number = 0): React.ReactNode => {
                                const children = childrenOf(entry.instanceId);
                                const hasChildren = children.length > 0;
                                const isCollapsed = collapsedAssemblies.has(entry.instanceId);

                                return (
                                    <div key={entry.instanceId}>
                                        <Card
                                            onClick={() => setSelectedPart(entry)}
                                            className={`p-4 cursor-pointer group border border-transparent hover:border-indigo-100 transition-all`}
                                            style={{ marginLeft: `${depth * 20}px` }}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                                    {hasChildren && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleCollapse(entry.instanceId); }}
                                                            className="mt-0.5 p-0.5 rounded hover:bg-slate-100 transition-colors shrink-0"
                                                            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                                                        >
                                                            <span className={`material-symbols-rounded text-[16px] text-slate-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} aria-hidden="true">
                                                                chevron_right
                                                            </span>
                                                        </button>
                                                    )}
                                                    {!hasChildren && depth > 0 && (
                                                        <div className="w-6 shrink-0" />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-sm text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                                                            {entry.part.name}
                                                            {hasChildren && <span className="text-[10px] text-slate-400 font-normal ml-2">({children.length} sub-parts)</span>}
                                                        </div>
                                                        <div className="flex gap-2 items-center mt-2 flex-wrap">
                                                            <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{entry.part.sku}</span>
                                                            <span className="text-[10px] font-bold text-slate-500">x{entry.quantity}</span>
                                                            {/user owned/i.test(entry.part.description || '')
                                                                ? <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1"><span className="material-symbols-rounded text-[12px]" aria-hidden="true">inventory</span>Owned</span>
                                                                : entry.sourcing?.online?.length
                                                                    ? <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1"><span className="material-symbols-rounded text-[12px]" aria-hidden="true">check</span>Sourced</span>
                                                                    : <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-sm font-bold text-slate-900 ml-4 shrink-0">${(entry.part.price * entry.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                            </div>
                                        </Card>
                                        {hasChildren && !isCollapsed && (
                                            <div className="mt-1 space-y-1">
                                                {children.map(child => renderEntry(child, depth + 1))}
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            return rootParts.length > 0 ? rootParts.map(entry => renderEntry(entry)) : null;
                        })()}
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