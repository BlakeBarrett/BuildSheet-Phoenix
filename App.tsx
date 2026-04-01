import React, { Component, useState, useRef, useEffect, useCallback, ErrorInfo } from 'react';
import heic2any from 'heic2any';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine, DraftingEngine, ProjectIndexEntry } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { isFirebaseConfigured } from './services/firebase.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { ComponentIdentification } from './services/aiTypes.ts';
import { DraftingSession, UserMessage, User, BOMEntry, Part, AssemblyPlan, EnclosureSpec, AdvancedValidationOption, DEFAULT_ADVANCED_VALIDATIONS } from './types.ts';
import { Button, Chip, Card, GoogleSignInButton, IconButton, UserAvatar } from './components/Material3UI.tsx';
import { ChiltonVisualizer } from './components/ChiltonVisualizer.tsx';
import { useService } from './contexts/ServiceContext.tsx';
import { ARGuideView } from './components/ARGuideView.tsx';
import { TestSuite, TestResult } from './services/testSuite.ts';
import { CookieConsent, hasFullConsent } from './components/CookieConsent.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { VisualManifestRenderer } from './components/VisualManifestRenderer.tsx';
import UserProfileModal from './components/UserProfileModal.tsx';
import { useTier } from './hooks/useTier.tsx';
import { UpgradeModal } from './components/UpgradeModal.tsx';
import { VoiceSession } from './components/VoiceSession.tsx';
import { SafetyAuditorPanel } from './components/SafetyAuditorPanel.tsx';
import { ProjectTemplatePicker, ProjectTemplate } from './components/ProjectTemplates.tsx';
import { PrivacyDisclosureToast, usePrivacyDisclosure } from './components/PrivacyDisclosure.tsx';
import { STLPreview } from './components/STLPreview.tsx';

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
    onDuplicate?: (id: string) => void;
    onArchive?: (id: string) => void;
    onUnarchive?: (id: string) => void;
    isGuest?: boolean;
    guestLimitReached?: boolean;
    onLogin?: () => void;
    onSendEmailLink?: (email: string) => Promise<void>;
    isMigrating?: boolean;
}> = ({ isOpen, onClose, projects, currentId, onSelect, onDelete, onNewProject, onExport, onValidate, onDuplicate, onArchive, onUnarchive, isGuest, guestLimitReached, onLogin, onSendEmailLink, isMigrating }) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [emailLinkSent, setEmailLinkSent] = useState(false);
    const [emailLinkSending, setEmailLinkSending] = useState(false);
    const [emailLinkError, setEmailLinkError] = useState('');
    if (!isOpen) return null;

    const handleSendLink = async () => {
        if (!onSendEmailLink || !emailInput.trim()) return;
        setEmailLinkSending(true);
        setEmailLinkError('');
        try {
            await onSendEmailLink(emailInput.trim());
            setEmailLinkSent(true);
        } catch (e: any) {
            setEmailLinkError(e?.message || 'Failed to send link');
        } finally {
            setEmailLinkSending(false);
        }
    };

    const filtered = projects.filter(p => {
      if (!showArchived && p.archived) return false;
      if (showArchived && !p.archived) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (p.name || '').toLowerCase().includes(q) || (p.preview || '').toLowerCase().includes(q);
    });

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="nav-title" onClick={onClose}>
            <div className="absolute left-4 top-4 bottom-4 w-[85vw] md:w-[380px] bg-[#F0F4F9] rounded-[28px] shadow-2xl flex flex-col animate-in slide-in-from-left-4 duration-300 overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="p-6 pb-2 flex justify-between items-center">
                    <div>
                        <h3 id="nav-title" className="text-2xl font-bold text-slate-800 leading-tight tracking-tight">Build History</h3>
                        <p className="text-sm text-slate-600 font-medium">Your Projects</p>
                    </div>
                    <IconButton icon="close" onClick={onClose} title="Close Navigator" />
                </header>

                <div className="px-4 pt-2 pb-1">
                    <div className="relative">
                        <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" aria-hidden="true">search</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search projects..."
                            aria-label="Search projects"
                            className="w-full pl-10 pr-4 py-2.5 bg-white rounded-[16px] border border-gray-200 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 placeholder:text-slate-400"
                        />
                    </div>
                </div>

                <div className="px-4 py-2 flex gap-2">
                    {isGuest && guestLimitReached ? (
                        <Button
                            variant="tonal"
                            icon="lock"
                            onClick={onLogin}
                            className="flex-1 justify-start bg-indigo-50 hover:bg-indigo-100 text-indigo-800 shadow-sm"
                        >
                            {t('nav.loginToSave')}
                        </Button>
                    ) : (
                        <Button
                            variant="tonal"
                            icon="add_circle"
                            onClick={() => { onNewProject(); onClose(); }}
                            className="flex-1 justify-start bg-white hover:bg-white/80 shadow-sm"
                        >
                            {t('app.newProject')}
                        </Button>
                    )}
                    <button
                        onClick={() => setShowArchived(!showArchived)}
                        className={`px-3 py-2 rounded-[16px] text-xs font-bold transition-colors ${showArchived ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                        title={showArchived ? 'Show active projects' : 'Show archived'}
                    >
                        <span className="material-symbols-rounded text-[16px]" aria-hidden="true">{showArchived ? 'unarchive' : 'archive'}</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-2">
                    {filtered.map((p) => (
                        <div key={p.id} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && !p.archived && onSelect(p.id)} className={`group relative p-3 rounded-[20px] transition-all cursor-pointer flex gap-4 items-center focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none ${p.archived ? 'opacity-60' : ''} ${p.id === currentId ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-800 hover:bg-indigo-50'}`} onClick={() => { if (!p.archived) { onSelect(p.id); onClose(); } }}>
                            {/* Visual Thumbnail */}
                            <div className={`w-14 h-14 rounded-[16px] overflow-hidden flex-shrink-0 border ${p.id === currentId ? 'border-indigo-400' : 'border-gray-100'}`}>
                                {p.thumbnail ? (
                                    <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center ${p.id === currentId ? 'bg-indigo-700' : 'bg-slate-100'}`}>
                                        <span className={`material-symbols-rounded ${p.id === currentId ? 'text-indigo-300' : 'text-slate-300'}`} aria-hidden="true">{p.archived ? 'archive' : 'draft'}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-bold text-base truncate pr-6">{p.name || 'Untitled Draft'}</span>
                                <span className={`text-xs truncate ${p.id === currentId ? 'text-indigo-100' : 'text-slate-500'}`}>{p.preview}{p.archived ? ' · Archived' : ''}</span>
                            </div>

                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shrink-0">
                                {p.archived ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onUnarchive?.(p.id); }}
                                        aria-label={`Unarchive ${p.name}`}
                                        className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                    >
                                        <span className="material-symbols-rounded text-[18px]" aria-hidden="true">unarchive</span>
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDuplicate?.(p.id); }}
                                            aria-label={`Duplicate ${p.name}`}
                                            className={`p-2 rounded-full transition-colors ${p.id === currentId ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                        >
                                            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">content_copy</span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onArchive?.(p.id); }}
                                            aria-label={`Archive ${p.name}`}
                                            className={`p-2 rounded-full transition-colors ${p.id === currentId ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                        >
                                            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">archive</span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                                            aria-label={`Delete ${p.name}`}
                                            className={`p-2 rounded-full transition-colors ${p.id === currentId ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                                        >
                                            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">delete</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="text-center py-20 opacity-40">
                            <p className="text-sm font-medium text-slate-500">{searchQuery ? 'No matching projects found.' : showArchived ? 'No archived projects.' : 'No project history found.'}</p>
                        </div>
                    )}
                </div>

                <footer className="p-4 bg-white/50 border-t border-gray-200/50">
                    {isMigrating && (
                        <div className="flex items-center gap-2 mb-3 p-3 bg-indigo-50 rounded-[16px] text-xs font-medium text-indigo-700" role="status" aria-live="polite">
                            <span className="material-symbols-rounded animate-spin text-[16px]" aria-hidden="true">sync</span>
                            {t('nav.migrating')}
                        </div>
                    )}
                    {isGuest && onLogin && (
                        <div className="mb-3 space-y-2">
                            <GoogleSignInButton onClick={onLogin} label={t('app.signInGoogle')} />
                            {onSendEmailLink && (
                                emailLinkSent ? (
                                    <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-[16px] text-xs font-medium text-emerald-700" role="status" aria-live="polite">
                                        <span className="material-symbols-rounded text-[16px]" aria-hidden="true">mark_email_read</span>
                                        {t('auth.emailLinkSent')}
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold uppercase tracking-widest px-1">
                                            <span className="flex-1 h-[1px] bg-slate-200"></span>
                                            {t('auth.orEmail')}
                                            <span className="flex-1 h-[1px] bg-slate-200"></span>
                                        </div>
                                        <div className="flex gap-1.5">
                                            <input
                                                type="email"
                                                value={emailInput}
                                                onChange={e => setEmailInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleSendLink()}
                                                placeholder={t('auth.emailPlaceholder')}
                                                aria-label={t('auth.emailPlaceholder')}
                                                autoComplete="email"
                                                className="flex-1 min-w-0 px-3 py-2 bg-white rounded-[12px] border border-gray-200 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 placeholder:text-slate-400"
                                            />
                                            <Button
                                                variant="tonal"
                                                icon={emailLinkSending ? 'sync' : 'send'}
                                                onClick={handleSendLink}
                                                disabled={emailLinkSending || !emailInput.trim()}
                                                className={`shrink-0 px-3 ${emailLinkSending ? 'animate-spin' : ''}`}
                                            >
                                                {t('auth.sendLink')}
                                            </Button>
                                        </div>
                                        {emailLinkError && (
                                            <p className="text-[11px] text-rose-600 font-medium px-1" role="alert">{emailLinkError}</p>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    )}
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-2">{t('nav.projectTools')}</p>
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => { onValidate(); onClose(); }} variant="tonal" className="text-xs h-10 bg-rose-50 text-rose-800 hover:bg-rose-100" icon="health_and_safety">{t('nav.healthCheck')}</Button>
                        <Button onClick={() => { onExport(); onClose(); }} variant="tonal" className="text-xs h-10 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" icon="data_object">{t('app.export')}</Button>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-6 bg-slate-900 rounded-[24px] text-white shadow-lg">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total Build Cost</span>
                            <div className="text-4xl font-mono font-medium mt-1 tracking-tight">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <div className="p-6 bg-indigo-100 rounded-[24px] text-indigo-900">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Kit Progress</span>
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
    onPreview3D?: (openSCADCode: string) => void;
}> = ({ entry, onClose, onSource, onHydrate, isHydrating, onUpdateQuantity, onUpdateName, onRemove, allEntries, onSetParent, onGenerateEnclosure, onExportSCAD, onPreview3D }) => {
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

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" aria-hidden="true">Qty</span>
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
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" aria-hidden="true">SKU</span>
                                <p className="text-sm font-mono text-slate-900 mt-1 truncate">{entry.part.sku}</p>
                            </div>
                            <div className="p-4 border border-gray-100 rounded-[20px]">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" aria-hidden="true">Price</span>
                                <p className="text-sm text-slate-900 mt-1 font-bold">${entry.part.price.toFixed(2)}</p>
                            </div>
                        </div>

                        {entry.part.ports && entry.part.ports.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-rounded text-violet-600 text-[18px]" aria-hidden="true">cable</span>
                                    <span className="text-[11px] font-bold text-violet-900 uppercase tracking-widest">Ports & Connectors</span>
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
                                            <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-widest">Global Marketplace</span>
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
                                            <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-widest">Local Availability</span>
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
                                    <span className="text-[11px] font-bold text-teal-900 uppercase tracking-widest">Sub-Assembly</span>
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
                                    <span className="text-[11px] font-bold text-cyan-900 uppercase tracking-widest">Enclosure Design</span>
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
                                        {onPreview3D && (entry as any).enclosure.openSCAD && (
                                            <Button variant="tonal" onClick={() => onPreview3D((entry as any).enclosure.openSCAD)} icon="view_in_ar" className="flex-1">3D Preview</Button>
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

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
    advancedValidations: AdvancedValidationOption[];
    onAdvancedChange: (updated: AdvancedValidationOption[]) => void;
    onRefresh: () => void;
    onApplyChanges?: () => void;
}> = ({ isOpen, onClose, result, isRunning, isDirty, isApplying, proposedActions, advancedValidations, onAdvancedChange, onRefresh, onApplyChanges }) => {
    const [advancedOpen, setAdvancedOpen] = useState(true);
    const [customInput, setCustomInput] = useState('');
    if (!isOpen) return null;
    const hasActions = proposedActions && proposedActions.length > 0;

    const toggleCheck = (id: string) => {
        onAdvancedChange(advancedValidations.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
    };

    const addCustomCheck = () => {
        const label = customInput.trim();
        if (!label) return;
        const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        if (advancedValidations.some(c => c.id === id)) return;
        onAdvancedChange([...advancedValidations, { id, label, enabled: true, kind: 'custom' }]);
        setCustomInput('');
    };

    const removeCustomCheck = (id: string) => {
        onAdvancedChange(advancedValidations.filter(c => c.id !== id));
    };

    const anyAdvancedEnabled = advancedValidations.some(c => c.enabled);

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
                            <h3 id="audit-title" className="text-xl font-bold text-slate-800 tracking-tight">Build Feasibility Check</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600 font-medium">Quick Validation</span>
                                {anyAdvancedEnabled && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">+ Advanced</span>}
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
                            <p className="text-slate-500 font-medium animate-pulse">
                                {anyAdvancedEnabled ? 'Running feasibility check + advanced validations...' : 'Checking build feasibility...'}
                            </p>
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

                    {/* Advanced Validation Section */}
                    <div className="mt-6 border border-slate-200 rounded-[20px] overflow-hidden">
                        <button
                            className="w-full px-5 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                            onClick={() => setAdvancedOpen(!advancedOpen)}
                            aria-expanded={advancedOpen}
                            type="button"
                        >
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded text-slate-500 text-[18px]" aria-hidden="true">tune</span>
                                <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Advanced Validation</span>
                                {anyAdvancedEnabled && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{advancedValidations.filter(c => c.enabled).length} active</span>}
                            </div>
                            <span className={`material-symbols-rounded text-slate-400 text-[20px] transition-transform ${advancedOpen ? 'rotate-180' : ''}`} aria-hidden="true">expand_more</span>
                        </button>

                        {advancedOpen && (
                            <div className="px-5 py-4 space-y-3 bg-white">
                                <p className="text-xs text-slate-500">Enable additional checks to include in the next audit run. These run on top of the standard feasibility check.</p>

                                {/* Built-in + custom checks */}
                                {advancedValidations.map(check => (
                                    <label key={check.id} className="flex items-center gap-3 py-1.5 group cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={check.enabled}
                                            onChange={() => toggleCheck(check.id)}
                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700 flex-1">{check.label}</span>
                                        {check.kind === 'custom' && (
                                            <button
                                                onClick={(e) => { e.preventDefault(); removeCustomCheck(check.id); }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500"
                                                aria-label={`Remove ${check.label}`}
                                                type="button"
                                            >
                                                <span className="material-symbols-rounded text-[16px]" aria-hidden="true">close</span>
                                            </button>
                                        )}
                                    </label>
                                ))}

                                {/* Add custom check */}
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                    <input
                                        type="text"
                                        value={customInput}
                                        onChange={e => setCustomInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCheck(); } }}
                                        placeholder='e.g. "GDPR Compliant", "UL Listed"...'
                                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        maxLength={120}
                                        aria-label="Add custom validation check"
                                    />
                                    <Button variant="tonal" onClick={addCustomCheck} disabled={!customInput.trim()} className="h-9 text-xs shrink-0" icon="add">Add</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <Button variant="tonal" onClick={onRefresh} disabled={isRunning || isApplying} icon={result ? "refresh" : "play_arrow"}>{result ? 'Re-Run' : 'Run Check'}</Button>
                    {hasActions && !isRunning && onApplyChanges && (
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
                            <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleFileSelect} aria-label="Upload component photo" />
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
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Est. Price</span>
                                    <p className="text-lg font-bold text-slate-900 mt-1">${result.estimatedPrice.toFixed(2)}</p>
                                </div>
                                <div className="p-4 border border-gray-100 rounded-[16px]">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Part ID</span>
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

// --- BOM IMPORT MODAL ---
const BOMImportModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onImportCSV: (csvText: string) => number;
    onImportPaste: (text: string) => number;
}> = ({ isOpen, onClose, onImportCSV, onImportPaste }) => {
    const [mode, setMode] = useState<'csv' | 'paste'>('csv');
    const [pasteText, setPasteText] = useState('');
    const [importResult, setImportResult] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            if (!text) return;
            const count = onImportCSV(text);
            setImportResult(`Imported ${count} part${count !== 1 ? 's' : ''} from CSV.`);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handlePasteImport = () => {
        if (!pasteText.trim()) return;
        const count = onImportPaste(pasteText);
        setImportResult(`Imported ${count} part${count !== 1 ? 's' : ''} from pasted text.`);
        setPasteText('');
    };

    const handleClose = () => {
        setImportResult(null);
        setPasteText('');
        setMode('csv');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 pb-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-[14px] bg-blue-100 text-blue-600 flex items-center justify-center" aria-hidden="true">
                            <span className="material-symbols-rounded text-[24px]">upload_file</span>
                        </div>
                        <div>
                            <h3 id="import-title" className="text-lg font-bold text-slate-800 tracking-tight">Import BOM</h3>
                            <p className="text-xs text-slate-500 font-medium">Add parts from a file or pasted list</p>
                        </div>
                    </div>
                    <IconButton icon="close" onClick={handleClose} title="Close" />
                </div>

                {/* Mode Tabs */}
                <div className="px-6 flex gap-2">
                    <button
                        onClick={() => setMode('csv')}
                        className={`flex-1 px-4 py-2 rounded-[12px] text-sm font-bold transition-colors ${mode === 'csv' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        CSV File
                    </button>
                    <button
                        onClick={() => setMode('paste')}
                        className={`flex-1 px-4 py-2 rounded-[12px] text-sm font-bold transition-colors ${mode === 'paste' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        Paste Text
                    </button>
                </div>

                <div className="flex-1 px-6 py-4">
                    {mode === 'csv' ? (
                        <div className="space-y-4">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files[0];
                                    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            const text = ev.target?.result as string;
                                            if (text) {
                                                const count = onImportCSV(text);
                                                setImportResult(`Imported ${count} part${count !== 1 ? 's' : ''} from CSV.`);
                                            }
                                        };
                                        reader.readAsText(file);
                                    }
                                }}
                                className="border-2 border-dashed border-blue-200 rounded-[20px] p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all"
                            >
                                <span className="material-symbols-rounded text-[40px] text-blue-300 mb-2 block" aria-hidden="true">cloud_upload</span>
                                <p className="text-sm font-bold text-slate-700 mb-1">Drop a CSV file here</p>
                                <p className="text-xs text-slate-500">or click to browse</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Headers auto-detected: Name, SKU, Category, Brand, Quantity, Price, Description.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <textarea
                                value={pasteText}
                                onChange={e => setPasteText(e.target.value)}
                                placeholder={"Paste a parts list here...\n\nExamples:\n2x Ball Bearing 6004\nTimken 42690 Tapered Roller\nCalifornia Mini Truck CV Axle\n\nCSV and tab-separated data also accepted."}
                                className="w-full h-48 p-4 bg-slate-50 rounded-[16px] border border-gray-200 text-sm text-slate-800 resize-none outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 placeholder:text-slate-400 font-mono"
                                aria-label="Paste parts list"
                            />
                            <Button
                                variant="primary"
                                onClick={handlePasteImport}
                                disabled={!pasteText.trim()}
                                className="w-full"
                                icon="playlist_add"
                            >
                                Import Parts
                            </Button>
                        </div>
                    )}

                    {importResult && (
                        <div className="mt-4 p-4 bg-emerald-50 rounded-[16px] text-sm font-bold text-emerald-800 flex items-center gap-2">
                            <span className="material-symbols-rounded text-[20px] text-emerald-500" aria-hidden="true">check_circle</span>
                            {importResult}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end">
                    <Button variant={importResult ? "primary" : "secondary"} onClick={handleClose}>{importResult ? 'Done' : 'Cancel'}</Button>
                </div>
            </div>
        </div>
    );
};

// --- Daily message counter (resets at midnight, persisted in localStorage) ---
const DAILY_MSG_KEY = 'buildsheet_daily_msgs';

function getDailyMessageCount(): number {
    const today = new Date().toISOString().split('T')[0];
    try {
        const stored = localStorage.getItem(DAILY_MSG_KEY);
        if (!stored) return 0;
        const { date, count } = JSON.parse(stored);
        return date === today ? (count as number) : 0;
    } catch { return 0; }
}

function saveDailyMessageCount(count: number): void {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(DAILY_MSG_KEY, JSON.stringify({ date: today, count }));
}

const AppContent: React.FC = () => {
    const { service: aiService } = useService();
    const [draftingEngine] = useState(() => getDraftingEngine());
    const [session, setSession] = useState<DraftingSession>(draftingEngine.getSession());
    const [input, setInput] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Tier-based gating
    const tierInfo = useTier();
    const [upgradeOpen, setUpgradeOpen] = useState(false);

    // Per-session usage counters for rate-limited features
    const [architectMessageCount, setArchitectMessageCount] = useState(() => getDailyMessageCount());
    const [validatorCallCount, setValidatorCallCount] = useState(0);
    const [plannerCallCount, setPlannerCallCount] = useState(0);

    const [auditOpen, setAuditOpen] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isApplyingAudit, setIsApplyingAudit] = useState(false);
    const [advancedValidations, setAdvancedValidations] = useState<AdvancedValidationOption[]>(
        () => session.advancedValidations ?? [...DEFAULT_ADVANCED_VALIDATIONS]
    );

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

    // Auth dropdown
    const [authMenuOpen, setAuthMenuOpen] = useState(false);
    const authMenuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!authMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (authMenuRef.current && !authMenuRef.current.contains(e.target as Node)) {
                setAuthMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [authMenuOpen]);

    // Mobile State
    const [mobileTab, setMobileTab] = useState<'draft' | 'bom'>('draft');

    // Desktop Window Bounds (for Overflow logic)
    const [windowHeight, setWindowHeight] = useState(window.innerHeight);
    const [navOverflowOpen, setNavOverflowOpen] = useState(false);
    const navOverflowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleResize = () => setWindowHeight(window.innerHeight);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!navOverflowOpen) return;
        const handler = (e: MouseEvent) => {
            if (navOverflowRef.current && !navOverflowRef.current.contains(e.target as Node)) {
                setNavOverflowOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [navOverflowOpen]);

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

    // BOM Import
    const [importModalOpen, setImportModalOpen] = useState(false);

    // Auth State
    const [currentUser, setCurrentUser] = useState<User | null>(UserService.getCurrentUser());
    const [isMigrating, setIsMigrating] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // New feature state
    const [voiceOpen, setVoiceOpen] = useState(false);
    const [safetyPanelOpen, setSafetyPanelOpen] = useState(false);
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
    const [stlPreviewOpen, setStlPreviewOpen] = useState(false);
    const [stlPreviewCode, setStlPreviewCode] = useState('');
    const privacyDisclosure = usePrivacyDisclosure();

    useEffect(() => {
        return UserService.onUserChange(setCurrentUser);
    }, []);

    // Auto-trigger login when arriving from marketing site with ?login=true
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') === 'true' && isFirebaseConfigured() && !UserService.isAuthenticated()) {
            // Clean the query param so it doesn't re-trigger on refresh
            if (window.history?.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }
            // Kick off login flow (async, but fire-and-forget is fine here)
            handleLogin();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load shared project from URL ?shared= parameter
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const shared = params.get('shared');
        if (shared) {
            const sharedSession = DraftingEngine.loadFromShareParam(shared);
            if (sharedSession) {
                // Load the shared session as a new project
                draftingEngine.importManifest(JSON.stringify(sharedSession));
                refreshState();
            }
            // Clean the query param
            if (window.history?.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLogin = useCallback(async () => {
        // Capture whether guest data exists BEFORE login
        const hadLocalProjects = draftingEngine.getProjectsList(true).length > 0;
        try {
            await UserService.login();
        } catch (e: any) {
            console.error('Login failed', e);
            return;
        }
        // Post-login migration
        if (hadLocalProjects && UserService.isAuthenticated()) {
            setIsMigrating(true);
            try {
                await draftingEngine.migrateLocalProjectsToFirestore();
                draftingEngine.clearLocalProjects();
            } finally {
                setIsMigrating(false);
            }
        }
        // Load all Firestore projects into local index
        if (UserService.isAuthenticated()) {
            await draftingEngine.loadProjectsFromFirestore();
        }
        refreshState();
    }, [draftingEngine]);

    const handleLogout = useCallback(async () => {
        await UserService.logout();
        // De-authenticate and redirect to marketing site
        window.location.href = '/';
    }, []);

    const handleDeleteAccount = useCallback(async () => {
        await UserService.deleteAccount();
        window.location.href = '/';
    }, []);

    const handleExportUserData = useCallback(() => {
        const data = {
            account: currentUser,
            projects: draftingEngine.getProjectsList(),
            activityLog: ActivityLogService.getLogs(),
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `buildsheet-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [currentUser, draftingEngine]);

    const handleNewProject = useCallback(() => {
        // Tier-based project limit check
        const activeProjects = draftingEngine.getProjectsList().filter((p: any) => !p.archived).length;
        if (activeProjects >= tierInfo.maxProjects) {
            setUpgradeOpen(true);
            return;
        }
        draftingEngine.createNewProject();
        refreshState();
    }, [draftingEngine, tierInfo.maxProjects]);

    const handleTemplateSelect = useCallback((template: ProjectTemplate) => {
        const activeProjects = draftingEngine.getProjectsList().filter((p: any) => !p.archived).length;
        if (activeProjects >= tierInfo.maxProjects) {
            setUpgradeOpen(true);
            return;
        }
        draftingEngine.createNewProject();
        draftingEngine.updateSessionName(template.name);
        refreshState();
        // Seed the chat with the template requirements
        setInput(template.requirements);
    }, [draftingEngine, tierInfo.maxProjects]);

    const handleSendEmailLink = useCallback(async (email: string) => {
        await UserService.sendEmailLink(email);
    }, []);

    // Complete passwordless email-link sign-in if the URL contains the link params.
    useEffect(() => {
        (async () => {
            try {
                const completed = await UserService.completeEmailLinkSignIn();
                if (completed && UserService.isAuthenticated()) {
                    // Run the same post-login migration as handleLogin
                    const hadLocal = draftingEngine.getProjectsList(true).length > 0;
                    if (hadLocal) {
                        setIsMigrating(true);
                        try {
                            await draftingEngine.migrateLocalProjectsToFirestore();
                            draftingEngine.clearLocalProjects();
                        } finally { setIsMigrating(false); }
                    }
                    await draftingEngine.loadProjectsFromFirestore();
                    refreshState();
                }
            } catch (e) {
                console.error('Email link sign-in failed', e);
            }
        })();
    }, [draftingEngine]);

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
        
        // Load persistent activity log from IndexedDB (only with full consent)
        if (hasFullConsent()) {
            ActivityLogService.loadFromStorage();
        }

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
            const designReqs = draftingEngine.getSession().designRequirements;
            const result = await aiService.findPartSources?.(entry.part.name, designReqs);
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
            const designReqs = draftingEngine.getSession().designRequirements;
            const details = await aiService.hydratePartDetails(entry.part.name, entry.part.category, designReqs);
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
        const designReqs = latestSession.designRequirements;

        // Process in batches of 3 for speed
        for (let i = 0; i < virtualParts.length; i += 3) {
            const batch = virtualParts.slice(i, i + 3);
            await Promise.all(batch.map(async (entry) => {
                try {
                    const details = await aiService.hydratePartDetails!(entry.part.name, entry.part.category, designReqs);
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

    const handleAdvancedValidationsChange = (updated: AdvancedValidationOption[]) => {
        setAdvancedValidations(updated);
        draftingEngine.setAdvancedValidations(updated);
        refreshState();
    };

    const performVerifyAudit = async (silent = false) => {
        const currentSession = draftingEngine.getSession();
        if (!aiService.verifyDesign || currentSession.bom.length === 0) return;
        if (silent && !currentSession.cacheIsDirty && currentSession.cachedAuditResult) return;

        if (!silent) await privacyDisclosure.triggerDisclosure('ai-analysis');

        // Tier-based validator limit (skip for silent/cached calls)
        if (!silent && validatorCallCount >= tierInfo.maxValidatorCalls) {
            setUpgradeOpen(true);
            return;
        }

        if (!silent) {
            setAuditOpen(true);
            setIsAuditing(true);
        }
        try {
            // Hydrate all virtual parts before running audit
            await hydrateAllVirtualParts();
            const latestSession = draftingEngine.getSession();
            const res = await aiService.verifyDesign(latestSession.bom, latestSession.designRequirements, latestSession.cachedAuditResult, advancedValidations);
            draftingEngine.cacheAuditResult(res.reasoning);

            // Use actions from verifyDesign response (single API call approach)
            if (res.auditActions && res.auditActions.length > 0) {
                draftingEngine.cacheAuditActions(res.auditActions);
            } else if (aiService.applyAuditRecommendations) {
                // Fallback: separate structured-output API call to extract actions from audit text
                try {
                    const freshSession = draftingEngine.getSession();
                    const { actions } = await aiService.applyAuditRecommendations(
                        freshSession.bom,
                        res.reasoning,
                        freshSession.designRequirements
                    );
                    if (actions && actions.length > 0) {
                        draftingEngine.cacheAuditActions(actions);
                    }
                } catch (e) {
                    console.error('Failed to pre-compute audit actions:', e);
                }
            }
        } catch (e) { console.error(e); } finally {
            // Always refresh state so the modal shows the latest data
            if (!silent) {
                setValidatorCallCount(prev => prev + 1);
                refreshState();
                setIsAuditing(false);
            }
        }
    }

    const performPlanAssembly = async (silent = false) => {
        const currentSession = draftingEngine.getSession();
        if (!aiService.generateAssemblyPlan || currentSession.bom.length === 0) return;
        if (silent && !currentSession.cacheIsDirty && currentSession.cachedAssemblyPlan) return;

        // Tier-based planner limit (skip for silent/cached calls)
        if (!silent && plannerCallCount >= tierInfo.maxPlannerCalls) {
            setUpgradeOpen(true);
            return;
        }

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
        } catch (e) { console.error(e); } finally { if (!silent) { setPlannerCallCount(prev => prev + 1); setIsPlanningAssembly(false); } }
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
        // Always open the modal to show cached results or let user configure
        setAuditOpen(true);
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
            <p class="disclaimer" style="color:#e67e22; font-size:12px; margin-bottom:16px; padding:8px 12px; background:#fef9f0; border-left:3px solid #e67e22; border-radius:4px;">&#9888; Generated by BuildSheet AI — verify all specifications before procurement or fabrication.</p>
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

    // --- BOM Import Handlers ---
    const handleImportCSV = (csvText: string): number => {
        const count = draftingEngine.importCSV(csvText);
        if (count > 0) refreshState();
        return count;
    };

    const handleImportPaste = (text: string): number => {
        const count = draftingEngine.importPastedText(text);
        if (count > 0) refreshState();
        return count;
    };

    // --- Project Management Handlers ---
    const handleDuplicateProject = (id: string) => {
        const newId = draftingEngine.duplicateProject(id);
        draftingEngine.loadProject(newId).then(refreshState);
    };

    const handleArchiveProject = (id: string) => {
        draftingEngine.archiveProject(id);
        refreshState();
        setProjectsList(draftingEngine.getProjectsList());
    };

    const handleUnarchiveProject = (id: string) => {
        draftingEngine.unarchiveProject(id);
        refreshState();
        setProjectsList(draftingEngine.getProjectsList(true));
    };

    // Visual Audit Handlers
    const handleScanPart = async (image: string) => {
        if (!aiService.identifyComponent) return;
        await privacyDisclosure.triggerDisclosure('image-upload');
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

        // Tier-based message limit
        if (architectMessageCount >= tierInfo.maxArchitectMessages) {
            setUpgradeOpen(true);
            return;
        }

        if (selectedImage) await privacyDisclosure.triggerDisclosure('image-upload');
        await privacyDisclosure.triggerDisclosure('ai-analysis');
        
        const currentInput = input;
        const currentImage = selectedImage;
        
        draftingEngine.addMessage({ role: 'user', content: currentInput, attachment: currentImage || undefined, timestamp: new Date() });
        refreshState();
        setInput('');
        setSelectedImage(null);
        setIsThinking(true);
        const newMsgCount = architectMessageCount + 1;
        setArchitectMessageCount(newMsgCount);
        saveDailyMessageCount(newMsgCount);
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

            // Populate VisualManifest if the architect returned one
            if (parsed.visualization && parsed.visualization.components && parsed.visualization.components.length > 0) {
                draftingEngine.setVisualManifest(parsed.visualization);
                stateModified = true;
            } else if (stateModified && !draftingEngine.getSession().visualManifest) {
                // Generate a fallback manifest from the BOM
                const fallback = draftingEngine.generateFallbackManifest();
                if (fallback) draftingEngine.setVisualManifest(fallback);
            }

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
    const isShortScreen = windowHeight < 900;

    return (
        <div className="flex h-[100dvh] w-full bg-[#F0F4F9] text-[#1F1F1F] overflow-hidden font-sans relative flex-col lg:flex-row p-0 pb-[90px] lg:p-3 lg:pb-3 gap-3">

            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-6 focus:py-3 focus:bg-indigo-600 focus:text-white focus:rounded-full focus:shadow-xl focus:font-bold">Skip to Main Content</a>

            <ProjectNavigator
                isOpen={isNavigatorOpen}
                onClose={() => setIsNavigatorOpen(false)}
                projects={projectsList}
                currentId={session.id}
                onSelect={(id) => draftingEngine.loadProject(id).then(refreshState)}
                onDelete={handleDeleteWithConfirm}
                onNewProject={handleNewProject}
                onExport={tierInfo.canExportJSON ? handleExport : () => setUpgradeOpen(true)}
                onValidate={runValidationSuite}
                onDuplicate={handleDuplicateProject}
                onArchive={handleArchiveProject}
                onUnarchive={handleUnarchiveProject}
                isGuest={!currentUser}
                guestLimitReached={projectsList.filter(p => !p.archived).length >= tierInfo.maxProjects}
                onLogin={handleLogin}
                onSendEmailLink={handleSendEmailLink}
                isMigrating={isMigrating}
            />
            <KitSummaryModal isOpen={kitSummaryOpen} onClose={() => setKitSummaryOpen(false)} session={session} onExport={handleExport} />
            <BOMImportModal isOpen={importModalOpen} onClose={() => { setImportModalOpen(false); refreshState(); }} onImportCSV={handleImportCSV} onImportPaste={handleImportPaste} />
            <ValidationReportModal
                isOpen={validationOpen}
                onClose={() => setValidationOpen(false)}
                results={validationResults}
                isRunning={isValidating}
                onRunAgain={runValidationSuite}
                onFixAll={handleOneClickKit}
            />
            <AssemblyModal isOpen={assemblyOpen} onClose={() => setAssemblyOpen(false)} plan={session.cachedAssemblyPlan || null} isRunning={isPlanningAssembly} isDirty={session.cacheIsDirty} onLaunchAR={() => setArOpen(true)} onRefresh={() => performPlanAssembly()} />
            <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} result={session.cachedAuditResult || null} isRunning={isAuditing} isDirty={session.cacheIsDirty} isApplying={isApplyingAudit} proposedActions={session.cachedAuditActions} advancedValidations={advancedValidations} onAdvancedChange={handleAdvancedValidationsChange} onRefresh={() => performVerifyAudit()} onApplyChanges={handleApplyAuditChanges} />
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
                onPreview3D={(code) => { setStlPreviewCode(code); setStlPreviewOpen(true); }}
            />
            {arOpen && session.cachedAssemblyPlan && <ARGuideView plan={session.cachedAssemblyPlan} aiService={aiService} onClose={() => setArOpen(false)} />}

            <DeleteConfirmDialog isOpen={deleteConfirmOpen} projectName={deleteTargetName} onConfirm={confirmDelete} onCancel={() => setDeleteConfirmOpen(false)} />
            <ScanPartModal isOpen={scanPartOpen} onClose={() => { setScanPartOpen(false); setScanResult(null); }} result={scanResult} isScanning={isScanning} onScan={handleScanPart} onAddToBOM={handleAddFromScan} />
            <PortWarningsPanel isOpen={portWarningsOpen} onClose={() => setPortWarningsOpen(false)} warnings={draftingEngine.getPortWarnings()} />

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <CookieConsent />
            {currentUser && (
                <UserProfileModal
                    isOpen={isProfileOpen}
                    onClose={() => setIsProfileOpen(false)}
                    user={currentUser}
                    onLogout={handleLogout}
                    onDeleteAccount={handleDeleteAccount}
                    onExportData={handleExportUserData}
                    planTier={tierInfo.tier}
                    onUpgrade={() => setUpgradeOpen(true)}
                />
            )}
            <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} isAuthenticated={tierInfo.isAuthenticated} onLogin={handleLogin} />

            {/* Voice Mode */}
            {voiceOpen && <VoiceSession bom={session.bom} plan={session.cachedAssemblyPlan} aiService={aiService} onClose={() => setVoiceOpen(false)} />}

            {/* Safety Auditor */}
            <SafetyAuditorPanel
                isOpen={safetyPanelOpen}
                onClose={() => setSafetyPanelOpen(false)}
                auditResult={session.cachedAuditResult || undefined}
                auditActions={session.cachedAuditActions || undefined}
                isAuditing={isAuditing}
                onRunAudit={() => performVerifyAudit()}
                onApplyActions={handleApplyAuditChanges}
                isApplyingAudit={isApplyingAudit}
                bom={session.bom}
                advancedValidations={advancedValidations}
                onToggleValidation={(id) => handleAdvancedValidationsChange(advancedValidations.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c))}
                onAddCustomValidation={(label) => {
                    const id = label.toLowerCase().replace(/\s+/g, '-');
                    if (advancedValidations.some(c => c.id === id)) return;
                    handleAdvancedValidationsChange([...advancedValidations, { id, label, enabled: true, kind: 'custom' as const }]);
                }}
                onUpdateValidationMetadata={(id, metadata) => handleAdvancedValidationsChange(advancedValidations.map(c => c.id === id ? { ...c, metadata } : c))}
            />

            {/* Project Templates */}
            <ProjectTemplatePicker
                isOpen={templatePickerOpen}
                onClose={() => setTemplatePickerOpen(false)}
                onSelect={handleTemplateSelect}
            />

            {/* STL / 3D Preview */}
            <STLPreview isOpen={stlPreviewOpen} openSCADCode={stlPreviewCode} onClose={() => setStlPreviewOpen(false)} />

            {/* Privacy Disclosure Toast */}
            <PrivacyDisclosureToast type={privacyDisclosure.active} />

            {/* M3 Navigation Rail (Floating on Desktop) */}
            <nav className="hidden lg:flex w-[80px] bg-white rounded-[40px] shadow-sm flex-col items-center py-6 gap-6 z-[60] shrink-0 h-full border border-gray-100 min-h-0" aria-label="Main navigation">
                <div className="w-12 h-12 bg-indigo-600 rounded-[16px] flex items-center justify-center text-white shadow-md shrink-0">
                    <span className="material-symbols-rounded text-2xl" aria-hidden="true">construction</span>
                </div>

                <div className="flex flex-col gap-3 flex-1 items-center w-full min-h-max shrink-0">
                    <IconButton
                        icon="add_box"
                        onClick={handleNewProject}
                        title="New Project"
                    />
                    <IconButton
                        icon="folder_open"
                        onClick={() => { setProjectsList(draftingEngine.getProjectsList()); setIsNavigatorOpen(true); }}
                        title="Projects"
                    />

                    <div className="w-8 h-[1px] bg-gray-200 my-1"></div>

                    {isShortScreen ? (
                        <div className="relative" ref={navOverflowRef}>
                            <button
                                onClick={() => setNavOverflowOpen(!navOverflowOpen)}
                                className={`w-12 h-12 rounded-[16px] flex items-center justify-center transition-colors ${navOverflowOpen ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                                title="More Tools"
                                aria-label="More tools menus"
                            >
                                <span className="material-symbols-rounded" aria-hidden="true">more_horiz</span>
                            </button>
                            {navOverflowOpen && (
                                <div className="absolute left-[calc(100%+12px)] top-0 w-56 bg-white rounded-[24px] shadow-xl border border-gray-100 overflow-y-auto z-[100] animate-in slide-in-from-left-2 duration-200" style={{ maxHeight: `calc(${windowHeight}px - 48px)` }} role="menu">
                                    <div className="p-2 flex flex-col gap-1">
                                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-50 mb-1">Export & Import</div>
                                        <button onClick={() => { setNavOverflowOpen(false); tierInfo.canExportJSON ? handleExport() : setUpgradeOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">data_object</span>JSON Data
                                        </button>
                                        <button onClick={() => { setNavOverflowOpen(false); tierInfo.canExportCSV ? handleExportCSV() : setUpgradeOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">table_view</span>CSV Sheet
                                        </button>
                                        <button onClick={() => { setNavOverflowOpen(false); tierInfo.canExportPDF ? handleExportPDF() : setUpgradeOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">picture_as_pdf</span>PDF Kit
                                        </button>
                                        <button onClick={() => { setNavOverflowOpen(false); setImportModalOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-cyan-50 hover:text-cyan-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">file_open</span>Import BOM
                                        </button>
                                        
                                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-50 mb-1 mt-1">Tools</div>
                                        <button onClick={() => { setNavOverflowOpen(false); setScanPartOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">photo_camera</span>Scan Part
                                        </button>
                                        <button onClick={() => { setNavOverflowOpen(false); setSafetyPanelOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-red-50 hover:text-red-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">health_and_safety</span>Safety Auditor
                                        </button>
                                        <button onClick={() => { setNavOverflowOpen(false); setTemplatePickerOpen(true); }} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 rounded-xl transition-colors text-left" role="menuitem">
                                            <span className="material-symbols-rounded text-[18px]">dashboard_customize</span>Templates
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <IconButton
                                icon="data_object"
                                onClick={tierInfo.canExportJSON ? handleExport : () => setUpgradeOpen(true)}
                                className={`${tierInfo.canExportJSON ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-slate-300 cursor-not-allowed'}`}
                                title={tierInfo.canExportJSON ? 'Export JSON' : 'Upgrade to export'}
                            />
                            <IconButton
                                icon="table_view"
                                onClick={tierInfo.canExportCSV ? handleExportCSV : () => setUpgradeOpen(true)}
                                className={`${tierInfo.canExportCSV ? 'text-blue-600 hover:bg-blue-50 hover:text-blue-700' : 'text-slate-300 cursor-not-allowed'}`}
                                title={tierInfo.canExportCSV ? 'Export CSV' : 'Upgrade to export'}
                            />
                            <IconButton
                                icon="picture_as_pdf"
                                onClick={tierInfo.canExportPDF ? handleExportPDF : () => setUpgradeOpen(true)}
                                className={`${tierInfo.canExportPDF ? 'text-orange-600 hover:bg-orange-50 hover:text-orange-700' : 'text-slate-300 cursor-not-allowed'}`}
                                title={tierInfo.canExportPDF ? 'Export PDF' : 'Upgrade to export'}
                            />
                            <IconButton
                                icon="file_open"
                                onClick={() => setImportModalOpen(true)}
                                className="text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700"
                                title="Import BOM"
                            />

                            <div className="w-8 h-[1px] bg-gray-200 my-1"></div>

                            <IconButton
                                icon="photo_camera"
                                onClick={() => setScanPartOpen(true)}
                                className="text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                                title="Scan Part"
                            />
                            <IconButton
                                icon="health_and_safety"
                                onClick={() => setSafetyPanelOpen(true)}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                title="Safety Auditor"
                            />
                            <IconButton
                                icon="dashboard_customize"
                                onClick={() => setTemplatePickerOpen(true)}
                                className="text-teal-600 hover:bg-teal-50 hover:text-teal-700"
                                title="Project Templates"
                            />
                        </>
                    )}
                </div>

                <div className="pb-2 flex flex-col gap-2 items-center shrink-0 mt-auto">
                    {tierInfo.tier === 'free' && (
                        <IconButton
                            icon="rocket_launch"
                            title="Upgrade to Pro"
                            onClick={() => setUpgradeOpen(true)}
                            className="text-violet-600 hover:bg-violet-50"
                        />
                    )}
                    <IconButton icon="tune" title="Settings" onClick={() => setIsSettingsOpen(true)} />
                    {currentUser ? (
                        <button
                            onClick={() => setIsProfileOpen(true)}
                            className="rounded-full border-2 border-transparent hover:border-indigo-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                            title={`Profile: ${currentUser.name}`}
                            aria-label="Open profile"
                        >
                            <UserAvatar avatar={currentUser.avatar} name={currentUser.name} sizeClass="w-10 h-10" />
                        </button>
                    ) : isFirebaseConfigured() ? (
                        <IconButton
                            icon="login"
                            title="Sign In"
                            className="text-indigo-600 hover:bg-indigo-50"
                            onClick={handleLogin}
                        />
                    ) : null}
                </div>
            </nav>

            {/* Main Content Area - Split Pane Layout */}
            <main id="main-content" className="flex-1 flex overflow-hidden relative gap-3 h-full min-h-0 min-w-0">

                {/* PANE 1: DRAFTING TABLE (Chat & Vis) */}
                <div className={`flex-1 flex flex-col h-full bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden relative min-h-0 min-w-0 ${mobileTab === 'draft' ? 'flex' : 'hidden lg:flex'}`}>
                    {/* Toolbar */}
                    <header className="px-6 py-4 flex justify-between items-center bg-white z-20 shrink-0">
                        <div className="flex items-center gap-3 lg:hidden">
                            <IconButton icon="menu" onClick={() => { setProjectsList(draftingEngine.getProjectsList()); setIsNavigatorOpen(true); }} className="lg:hidden -ml-2" title="Menu" />
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

                            {/* Auth chip — visible on all screen sizes */}
                            {isFirebaseConfigured() && (
                                <div className="relative" ref={authMenuRef}>
                                    {currentUser ? (
                                        <>
                                            <button
                                                onClick={() => setAuthMenuOpen(v => !v)}
                                                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                                aria-label={`Account: ${currentUser.name}`}
                                                aria-expanded={authMenuOpen}
                                                aria-haspopup="true"
                                            >
                                                <UserAvatar avatar={currentUser.avatar} name={currentUser.name} sizeClass="w-8 h-8" />
                                                <span className="hidden md:block text-sm font-semibold text-slate-700 max-w-[96px] truncate">{currentUser.name.split(' ')[0]}</span>
                                                <span className="material-symbols-rounded text-[16px] text-slate-400 hidden md:block" aria-hidden="true">expand_more</span>
                                            </button>
                                            {authMenuOpen && (
                                                <div className="absolute top-full right-0 mt-2 w-52 bg-white rounded-[16px] shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150" role="menu">
                                                    <div className="px-4 py-3 border-b border-gray-50">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{currentUser.name}</p>
                                                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{currentUser.email}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => { setAuthMenuOpen(false); setIsProfileOpen(true); }}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                                                        role="menuitem"
                                                    >
                                                        <span className="material-symbols-rounded text-[18px]" aria-hidden="true">person</span>
                                                        Profile &amp; Privacy
                                                    </button>
                                                    <button
                                                        onClick={() => { setAuthMenuOpen(false); handleLogout(); }}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                                                        role="menuitem"
                                                    >
                                                        <span className="material-symbols-rounded text-[18px]" aria-hidden="true">logout</span>
                                                        Sign Out
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <button
                                            onClick={handleLogin}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
                                            aria-label="Sign in"
                                        >
                                            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">login</span>
                                            <span className="hidden sm:inline">Sign In</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </header>

                    {/* Hero Visualizer — Block Diagram + Image Gallery */}
                    <div className="px-4 pb-2 h-[30%] md:h-[40%] shrink-0 flex flex-col min-h-0 min-w-0">
                        {session.visualManifest && session.visualManifest.components.length > 0 ? (
                            <div className="flex-1 flex gap-2 min-h-0 min-w-0">
                                <div className="flex-1 min-w-0 min-h-0">
                                    <VisualManifestRenderer
                                        manifest={session.visualManifest}
                                        bom={session.bom}
                                        onComponentClick={(partId) => {
                                            const entry = session.bom.find(b => b.part.id === partId);
                                            if (entry) setSelectedPart(entry);
                                        }}
                                    />
                                </div>
                                <div className="w-[40%] min-w-0 min-h-0">
                                    <ChiltonVisualizer images={session.generatedImages} onGenerate={handleGenerateVisual} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
                                </div>
                            </div>
                        ) : (
                            <ChiltonVisualizer images={session.generatedImages} onGenerate={handleGenerateVisual} isGenerating={isVisualizing} hasItems={session.bom.length > 0} />
                        )}
                    </div>

                    {/* Conversation Feed */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 bg-white" aria-label="Conversation Feed" role="log" aria-live="polite" tabIndex={0}>
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
                                                draftingEngine.loadProject(newId).then(refreshState);
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
                                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-slate-700 shadow-sm" title="Remove image" aria-label="Remove attached image">
                                    <span className="material-symbols-rounded text-[14px]" aria-hidden="true">close</span>
                                </button>
                            </div>
                        )}
                        <div className="relative bg-[#F2F6FC] rounded-[32px] transition-all hover:bg-[#EBF1F8] focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 focus-within:shadow-md flex items-center">
                            {/* Message limit warning */}
                            {tierInfo.maxArchitectMessages !== Infinity && (
                                <div className="absolute -top-7 left-3 right-3 flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        {architectMessageCount >= tierInfo.maxArchitectMessages
                                            ? <button onClick={() => setUpgradeOpen(true)} className="text-amber-600 hover:text-amber-700 transition-colors">Message limit reached — Upgrade</button>
                                            : `${tierInfo.maxArchitectMessages - architectMessageCount} message${tierInfo.maxArchitectMessages - architectMessageCount !== 1 ? 's' : ''} remaining today`}
                                    </span>
                                    {!tierInfo.isAuthenticated && (
                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Guest</span>
                                    )}
                                </div>
                            )}
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
                                title="Attach file"
                                aria-label="Attach file"
                            >
                                <span className="material-symbols-rounded">attach_file</span>
                            </label>
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder="Instruct Gemini to build..."
                                aria-label="Instruct Gemini to build"
                                className="w-full pr-24 py-4 bg-transparent border-none text-slate-800 resize-none outline-none placeholder:text-slate-500"
                                rows={1}
                            />
                            <button
                                onClick={tierInfo.hasVoiceMode ? () => setVoiceOpen(true) : () => setUpgradeOpen(true)}
                                aria-label={tierInfo.hasVoiceMode ? 'Voice Mode' : 'Upgrade for Voice Mode'}
                                title={tierInfo.hasVoiceMode ? 'Voice Mode' : 'Upgrade for Voice Mode'}
                                className={`absolute right-14 top-2 w-10 h-10 rounded-full flex items-center justify-center transition-all ${tierInfo.hasVoiceMode ? 'text-slate-500 hover:text-amber-600 hover:bg-white' : 'text-slate-300 hover:text-slate-400 hover:bg-white'}`}
                            >
                                <span className="material-symbols-rounded" aria-hidden="true">mic</span>
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isThinking}
                                aria-label="Send Message"
                                className="absolute right-2 top-2 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-all shadow-md active:scale-90 disabled:opacity-0 disabled:scale-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 focus-visible:outline-none"
                            >
                                <span className="material-symbols-rounded" aria-hidden="true">arrow_upward</span>
                            </button>
                        </div>
                        <p className="text-center text-xs text-slate-400 mt-2 px-2">
                            All outputs are draft-quality — verify all specifications before procurement or fabrication.
                        </p>
                    </footer>
                </div>

                {/* PANE 2: BOM & ACTIONS (Right Sidebar) */}
                <div className={`lg:w-[420px] xl:w-[460px] flex-col bg-[#F8FAFC] rounded-[32px] border border-gray-200 shadow-sm overflow-hidden min-h-0 min-w-0 ${mobileTab === 'bom' ? 'flex flex-1' : 'hidden lg:flex'}`}>
                    <header className="px-6 py-6 bg-white border-b border-gray-100 flex flex-col gap-4 shrink-0">
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
                <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-[80px] z-50 px-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }} role="tablist" aria-label="Mobile navigation">
                    <button
                        onClick={() => setMobileTab('draft')}
                        role="tab"
                        aria-selected={mobileTab === 'draft'}
                        aria-label="Switch to Draft tab"
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 rounded-full ${mobileTab === 'draft' ? 'text-indigo-600' : 'text-slate-600'}`}
                    >
                        <div className={`px-5 py-1 rounded-full transition-colors ${mobileTab === 'draft' ? 'bg-indigo-100' : 'bg-transparent'}`}>
                            <span className="material-symbols-rounded text-[24px]" aria-hidden="true">edit_note</span>
                        </div>
                        <span className="text-[11px] font-bold">Draft</span>
                    </button>
                    <button
                        onClick={() => setMobileTab('bom')}
                        role="tab"
                        aria-selected={mobileTab === 'bom'}
                        aria-label="Switch to Parts tab"
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 rounded-full ${mobileTab === 'bom' ? 'text-indigo-600' : 'text-slate-600'}`}
                    >
                        <div className={`px-5 py-1 rounded-full transition-colors ${mobileTab === 'bom' ? 'bg-indigo-100' : 'bg-transparent'}`}>
                            <span className="material-symbols-rounded text-[24px]" aria-hidden="true">inventory_2</span>
                        </div>
                        <span className="text-[11px] font-bold">Parts</span>
                    </button>
                    {isFirebaseConfigured() && (
                        <button
                            onClick={currentUser ? () => setIsProfileOpen(true) : handleLogin}
                            role="tab"
                            aria-selected={false}
                            aria-label={currentUser ? `Profile (${currentUser.name})` : 'Sign in'}
                            className="flex flex-col items-center justify-center w-full h-full gap-1"
                        >
                            <div className="px-5 py-1 rounded-full transition-colors">
                                {currentUser ? (
                                    <UserAvatar avatar={currentUser.avatar} name={currentUser.name} sizeClass="w-6 h-6" />
                                ) : (
                                    <span className="material-symbols-rounded text-[24px] text-indigo-600" aria-hidden="true">login</span>
                                )}
                            </div>
                            <span className={`text-[11px] font-bold ${currentUser ? 'text-slate-600' : 'text-indigo-600'}`}>
                                {currentUser ? 'Profile' : 'Sign In'}
                            </span>
                        </button>
                    )}
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