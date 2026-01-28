import React, { useState, useRef, useEffect, Component, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getDraftingEngine } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { DraftingSession, UserMessage, User, BOMEntry } from './types.ts';
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
    const [countdown, setCountdown] = useState(5);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (isOpen && pendingFixes.length > 0 && !isRunning) {
            setCountdown(5);
            timerRef.current = window.setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        if (timerRef.current) clearInterval(timerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isOpen, pendingFixes, isRunning]);

    useEffect(() => {
        if (countdown === 0 && pendingFixes.length > 0 && isOpen) {
            onApply();
        }
    }, [countdown, pendingFixes, isOpen, onApply]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-labelledby="audit-title">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isRunning ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-green-100 text-green-700'}`}>
                           {isRunning ? (
                               <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           ) : (
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                           )}
                        </div>
                        <div>
                            <h3 id="audit-title" className="text-xl font-medium text-slate-800">{t('audit.title')}</h3>
                            <p className="text-sm text-gray-500">{isRunning ? "Gemini 3.0 Pro..." : "Audit Complete"}</p>
                        </div>
                    </div>
                    {!isRunning && <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2 rounded-full hover:bg-gray-100" aria-label="Close">&times;</button>}
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {isRunning ? (
                        <div className="space-y-4">
                            <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-5/6 animate-pulse"></div>
                            <p className="text-center text-xs text-gray-400 mt-8">{t('status.thinking')}</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="prose prose-sm prose-slate max-w-none">
                                <ReactMarkdown>{result || ''}</ReactMarkdown>
                            </div>
                            
                            {pendingFixes.length > 0 && (
                                <div className="bg-indigo-50 border border-indigo-100 rounded-[20px] p-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <h4 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                        Proposed System Patches
                                    </h4>
                                    <div className="space-y-2 mb-4">
                                        {pendingFixes.map((fix, i) => (
                                            <div key={i} className="flex items-center gap-3 text-sm bg-white p-3 rounded-xl border border-indigo-100 shadow-sm">
                                                {fix.type === 'removePart' && <span className="text-red-700 font-bold px-2 py-0.5 bg-red-100 rounded text-xs">DEL</span>}
                                                {fix.type === 'addPart' && <span className="text-green-700 font-bold px-2 py-0.5 bg-green-100 rounded text-xs">ADD</span>}
                                                <span className="font-mono text-slate-600 truncate flex-1">
                                                    {fix.type === 'removePart' ? `Instance: ${fix.instanceId?.split('-')[0]}...` : `Part: ${fix.partId} (x${fix.qty})`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between bg-white/60 rounded-xl p-3">
                                        <div className="text-xs font-bold text-indigo-800">
                                            Auto-applying in <span className="text-lg font-mono text-indigo-600 w-4 inline-block text-center">{countdown}</span>s
                                        </div>
                                        <div className="flex gap-2">
                                            <Button 
                                                onClick={onDecline}
                                                variant="ghost"
                                                className="text-xs h-8 px-3"
                                            >
                                                Decline
                                            </Button>
                                            <Button onClick={onApply} variant="primary" className="text-xs h-8 px-3">
                                                Apply Now
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {!pendingFixes.length && (
                    <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end">
                        <Button onClick={onClose} variant="primary" disabled={isRunning}>
                            {isRunning ? t('audit.running') : 'Close Report'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

const FabricationModal: React.FC<{ isOpen: boolean; onClose: () => void; result: string | null; isRunning: boolean; partName: string }> = ({ isOpen, onClose, result, isRunning, partName }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-labelledby="fab-title">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRunning ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-blue-100 text-blue-700'}`}>
                           {isRunning ? (
                               <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           ) : (
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                           )}
                        </div>
                        <div>
                            <h3 id="fab-title" className="text-lg font-bold text-slate-800">{t('fab.title')}</h3>
                            <p className="text-xs text-gray-500">Drafting spec for: <strong>{partName}</strong></p>
                        </div>
                    </div>
                    {!isRunning && <button onClick={onClose} className="text-gray-400 hover:text-slate-800" aria-label="Close">&times;</button>}
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {isRunning ? (
                         <div className="space-y-4">
                            <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                             <p className="text-center text-xs text-gray-400 mt-8">{t('status.thinking')}</p>
                        </div>
                    ) : (
                         <div className="prose prose-sm prose-slate max-w-none">
                            <ReactMarkdown>{result || ''}</ReactMarkdown>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end gap-2">
                    {!isRunning && (
                        <>
                             <Button onClick={() => window.open('https://www.pcbway.com/', '_blank')} variant="secondary">
                                {t('fab.pcbway')}
                            </Button>
                            <Button onClick={() => window.open('https://sendcutsend.com/', '_blank')} variant="secondary">
                                {t('fab.scs')}
                            </Button>
                        </>
                    )}
                    <Button onClick={onClose} variant="primary">Close Brief</Button>
                </div>
            </div>
        </div>
    );
};

const PartPickerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (partId: string) => void;
    engine: any;
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

    const handleSearch = (val: string) => {
        setQuery(val);
        setResults(engine.searchRegistry(val));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                 <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-[#FDFDFD]">
                     <h3 className="font-medium text-gray-800 text-lg">{t('bom.add')}</h3>
                     <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100">&times;</button>
                 </div>
                 <div className="p-4 border-b border-gray-100">
                     <input
                        autoFocus
                        type="text"
                        placeholder={t('bom.search')}
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-gray-50"
                     />
                 </div>
                 <div className="flex-1 overflow-y-auto p-2">
                     {results.length === 0 ? (
                         <div className="text-center p-8 text-gray-400 text-sm">{t('bom.no_results')}</div>
                     ) : (
                         <div className="space-y-1">
                             {results.map(part => (
                                 <div key={part.id} className="flex justify-between items-center p-3 hover:bg-indigo-50 rounded-xl group transition-colors cursor-default">
                                     <div className="overflow-hidden">
                                         <div className="font-medium text-sm text-gray-900 truncate">{part.name}</div>
                                         <div className="text-xs text-gray-500 font-mono truncate">{part.sku} • {part.category}</div>
                                     </div>
                                     <Button 
                                        onClick={() => { onAdd(part.id); onClose(); }}
                                        variant="tonal"
                                        className="h-8 px-3 text-xs"
                                     >
                                         {t('bom.add')}
                                     </Button>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
            </div>
        </div>
    );
};

const PartDetailModal: React.FC<{ 
    entry: BOMEntry | null; 
    onClose: () => void; 
    onFabricate: (part: any) => void;
    onSource: (entry: BOMEntry) => void;
    onManualSource: (instanceId: string, url: string) => void;
}> = ({ entry, onClose, onFabricate, onSource, onManualSource }) => {
    // ... logic remains same ...
    const { t } = useTranslation();
    const [manualUrlInput, setManualUrlInput] = useState('');
    
    useEffect(() => {
        if (entry?.sourcing?.manualUrl) {
            setManualUrlInput(entry.sourcing.manualUrl);
        } else {
            setManualUrlInput('');
        }
    }, [entry]);

    if (!entry) return null;
    const { part, isCompatible, warnings } = entry;
    const isVirtual = part.sku.startsWith('DRAFT-');
    const sourcing = entry.sourcing;

    const handleSaveManualUrl = () => {
        if (manualUrlInput.trim()) {
            onManualSource(entry.instanceId, manualUrlInput.trim());
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-labelledby="detail-title">
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-[#FDFDFD]">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Chip label={part.category} color={isVirtual ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-700"} />
                            {!isCompatible && <Chip label={t('bom.incompatible')} color="bg-red-100 text-red-700" />}
                        </div>
                        <h3 id="detail-title" className="text-xl font-medium text-slate-900 leading-tight">{part.name}</h3>
                        <p className="text-xs font-mono text-gray-400 mt-1">{part.sku}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-2 rounded-full hover:bg-gray-100" aria-label="Close">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Status Banner */}
                    {(!isCompatible || (warnings && warnings.length > 0)) && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <h4 className="text-xs font-bold text-amber-800 uppercase">Compatibility Warnings</h4>
                            <ul className="list-disc list-inside text-xs text-amber-900 space-y-1">
                                {warnings?.map((w, i) => <li key={i}>{w}</li>)}
                                {!isCompatible && <li>Interfaces do not match existing system ports.</li>}
                            </ul>
                        </div>
                    )}

                    {/* Sourcing Section */}
                    <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
                         <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
                                {t('bom.sourcing')}
                            </h4>
                            <Button 
                                onClick={() => onSource(entry)} 
                                disabled={sourcing?.loading}
                                variant="tonal"
                                className="h-7 text-[10px] px-2"
                            >
                                {sourcing?.loading ? "Searching..." : "Refresh Search"}
                            </Button>
                         </div>

                         {/* AI Results */}
                         <div className="space-y-2 mb-4">
                             {sourcing?.data?.options && sourcing.data.options.length > 0 ? (
                                 sourcing.data.options.map((opt, i) => (
                                     <a key={i} href={opt.url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 transition-all group shadow-sm">
                                         <div className="font-medium text-xs text-slate-800 truncate group-hover:text-indigo-700">{opt.title}</div>
                                         <div className="text-[10px] text-gray-400 mt-0.5">{opt.source}</div>
                                     </a>
                                 ))
                             ) : (
                                 <div className="text-xs text-gray-400 italic text-center py-2">No automatic results found. Try refreshing search.</div>
                             )}
                         </div>

                         {/* Manual Override */}
                         <div className="pt-3 border-t border-indigo-100">
                            <label className="block text-[10px] font-bold text-indigo-900 uppercase mb-1">Custom Vendor Link</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={manualUrlInput}
                                    onChange={(e) => setManualUrlInput(e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-indigo-400 outline-none"
                                />
                                <Button 
                                    onClick={handleSaveManualUrl}
                                    variant="primary"
                                    className="h-auto py-1 px-3 text-xs"
                                >
                                    Save
                                </Button>
                            </div>
                         </div>
                    </div>

                    {/* Overview & Ports Sections - Simplified for brevity but assume standard rendering */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Overview</h4>
                        <p className="text-sm text-slate-700 leading-relaxed">{part.description}</p>
                        
                        {isVirtual && (
                            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Virtual Component</h4>
                                <p className="text-xs text-gray-500 mb-3">This part was architected by Gemini. You can generate a fabrication spec for it.</p>
                                <Button onClick={() => onFabricate(part)} variant="secondary" className="w-full justify-center">
                                    {t('fab.button')}
                                </Button>
                            </div>
                        )}
                        {!isVirtual && (
                            <div className="mt-3 grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <span className="block text-[10px] text-gray-400 uppercase">Brand</span>
                                    <span className="text-sm font-medium text-slate-800">{part.brand}</span>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <span className="block text-[10px] text-gray-400 uppercase">Unit Price</span>
                                    <span className="text-sm font-medium text-slate-800">${part.price.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Ports Table */}
                    {part.ports.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Interface Ports</h4>
                            <div className="border border-gray-100 rounded-xl overflow-hidden">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium">
                                        <tr>
                                            <th className="px-3 py-2">Name</th>
                                            <th className="px-3 py-2">Type</th>
                                            <th className="px-3 py-2">Gender</th>
                                            <th className="px-3 py-2">Spec</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {part.ports.map((port, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 font-medium text-slate-700">{port.name}</td>
                                                <td className="px-3 py-2 text-gray-500">{port.type}</td>
                                                <td className="px-3 py-2 text-gray-500">{port.gender}</td>
                                                <td className="px-3 py-2 font-mono text-slate-600">{port.spec}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-[#FDFDFD] flex justify-end">
                    <Button onClick={onClose} variant="primary">Close</Button>
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
      if (percentage < 33) percentage = 33;
      if (percentage > 50) percentage = 50;
      
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
  }, [session.messages, mobileView]);

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

  const processArchitectRequest = async (text: string, attachment?: string | null) => {
      setIsThinking(true);
      try {
          const currentSession = draftingEngine.getSession();
          const allMessages = currentSession.messages;
          const historyMessages = allMessages.slice(0, -1); 
          
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
      const lastMsg = currentMsgs[currentMsgs.length - 1];
      
      if (lastMsg?.role === 'assistant' && lastMsg.content.includes('[SYSTEM ERROR]')) {
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
      setPendingFixes([]); // Clear previous pending

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
      
      // Auto source new parts
      addedParts.forEach(partEntry => {
          handleSourcePart(partEntry);
      });

      // Update Visuals if design changed
      if (designChanged) {
         handleGenerateVisual("Applied system integrity patches automatically.", undefined);
      }

      setPendingFixes([]);
      setAuditOpen(false);
  };

  const declineFixes = () => {
      setPendingFixes([]);
      // Don't close modal, let user read report
  };

  const handleFabricate = async (part: any) => {
     if (!aiService.generateFabricationBrief) return;
     setFabPartName(part.name);
     setFabModalOpen(true);
     setIsFabricating(true);
     setFabResult(null);

     try {
         const context = `Design Requirements: ${session.designRequirements}. \nFull BOM Context: ${session.bom.map(b => b.part.name).join(', ')}`;
         const brief = await aiService.generateFabricationBrief(part.name, context);
         setFabResult(brief);
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
      <PartDetailModal 
        entry={selectedPart}
        onClose={() => setSelectedPart(null)}
        onFabricate={handleFabricate}
        onSource={handleSourcePart}
        onManualSource={handleManualSource}
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

      {/* Sidebar Navigation - Hidden on Mobile */}
      <nav className="hidden md:flex w-[88px] border-r border-gray-200 bg-white flex-col items-center py-6 gap-6 flex-shrink-0 shadow-sm z-20 relative">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-100 ring-4 ring-indigo-50 mb-2" aria-label="BuildSheet Logo">B</div>
        
        <div className="flex flex-col gap-4 flex-1 w-full items-center">
          <button 
            onClick={handleNewProject}
            className="w-12 h-12 flex items-center justify-center text-indigo-600 bg-indigo-50 rounded-2xl transition-all hover:bg-indigo-100 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
            title={t('app.newProject')}
            aria-label={t('app.newProject')}
          >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </button>

          <button 
            onClick={() => setShowProjects(!showProjects)}
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${showProjects ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-50'}`}
            title={t('app.projects')}
            aria-label={t('app.projects')}
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
          </button>

          <button 
            onClick={() => setShowLogs(!showLogs)} 
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${showLogs ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-50'}`}
            title="System Logs"
            aria-label="System Logs"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>

          {/* Language Switcher Desktop */}
          <div className="group relative flex items-center justify-center mt-auto">
             <button className="text-[10px] font-bold text-gray-400 hover:text-indigo-600 uppercase border border-gray-200 rounded px-1.5 py-1" aria-label="Change Language">
                 {i18n.language.slice(0,2)}
             </button>
             <div className="absolute left-10 bottom-0 bg-white border border-gray-200 shadow-xl rounded-lg p-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                 {['en', 'es', 'pt', 'de', 'fr', 'hi'].map(lang => (
                     <button key={lang} onClick={() => i18n.changeLanguage(lang)} className="text-xs px-2 py-1 hover:bg-indigo-50 rounded text-left uppercase">
                         {lang}
                     </button>
                 ))}
             </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4">
          {currentUser ? (
             <button onClick={() => UserService.logout()} className="relative group" aria-label={t('app.logOut')}>
                <img src={currentUser.avatar} alt="User Avatar" className="w-10 h-10 rounded-full border-2 border-indigo-100 group-hover:border-red-400 transition-colors" />
             </button>
          ) : (
            <button 
              onClick={() => UserService.login()}
              className="w-10 h-10 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-all p-2"
              aria-label={t('app.signInGoogle')}
              title={t('app.signInGoogle')}
            >
              <svg className="w-full h-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path fill="#4285F4" d="M23.49,12.27c0-0.79-0.07-1.54-0.19-2.27H12v4.51h6.47c-0.29,1.48-1.14,2.73-2.4,3.58v3h3.86 c2.26-2.09,3.56-5.17,3.56-8.82z"/>
                    <path fill="#34A853" d="M12,24c3.24,0,5.95-1.08,7.92-2.91l-3.86-3c-1.08,0.72-2.45,1.16-4.06,1.16c-3.13,0-5.78-2.11-6.73-4.96 H1.29v3.09C3.3,21.3,7.31,24,12,24z"/>
                    <path fill="#FBBC05" d="M5.27,14.29c-0.25-0.72-0.38-1.49-0.38-2.29s0.14-1.57,0.38-2.29V6.62H1.29C0.47,8.24,0,10.06,0,12 s0.47,3.76,1.29,5.38L5.27,14.29z"/>
                    <path fill="#EA4335" d="M12,4.75c1.77,0,3.35,0.61,4.6,1.8l3.42-3.42C17.95,1.19,15.24,0,12,0C7.31,0,3.3,2.7,1.29,6.62l3.98,3.09 C6.22,6.86,8.87,4.75,12,4.75z"/>
                </g>
              </svg>
            </button>
          )}
        </div>
      </nav>

      {/* Project Drawer - Full width on Mobile */}
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
        {/* Left Pane: Visualizer (Desktop) + Architect (Chat) */}
        <section ref={leftPaneRef as React.RefObject<HTMLElement>} className={`flex-1 flex flex-col border-r border-gray-200 bg-white transition-all duration-500 ${showLogs ? 'opacity-30 pointer-events-none scale-95' : ''} ${mobileView === 'visuals' ? 'hidden md:flex' : 'flex'}`}>
          <header className="px-6 py-4 md:px-8 md:py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-medium text-lg md:text-xl tracking-tight text-slate-900">{t('app.title')}</h1>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-medium truncate max-w-[150px]">
                    {session.name || "Untitled"}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">{aiService.name}</p>
                <div 
                    className={`flex items-center gap-1.5 transition-all`}
                    title={aiStatus === 'offline' ? t('status.offline') : t('status.online')}
                >
                    <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'online' ? 'bg-green-500' : aiStatus === 'offline' ? 'bg-amber-500' : 'bg-gray-300 animate-pulse'}`}></div>
                    {aiStatus === 'offline' && <span className="text-[9px] font-bold text-amber-600 uppercase">{t('status.offline')}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2 text-xs font-mono text-gray-400 items-center">
                <Button 
                   onClick={() => setShareModalOpen(true)}
                   variant="ghost" 
                   className="hidden md:flex h-8 px-3 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100"
                >
                   Share
                </Button>

                <div className="hidden md:block">
                   {currentUser ? `${currentUser.username}@${session.slug}` : 'guest@local-draft'}
                </div>
                {/* Desktop/Tablet Toggle for BOM */}
                <button 
                  onClick={() => setIsBomOpen(!isBomOpen)}
                  className="hidden md:flex p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all ml-2 border border-transparent hover:border-indigo-100"
                  title={isBomOpen ? "Close BOM Panel" : "Open BOM Panel"}
                  aria-label="Toggle BOM Panel"
                >
                    <svg className={`w-5 h-5 transform transition-transform ${isBomOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="sr-only">Toggle Sidebar</span>
                </button>
                {/* Mobile Project Trigger */}
                <button 
                    onClick={() => setShowProjects(true)}
                    className="md:hidden p-2 -mr-2 text-gray-400 hover:text-indigo-600"
                    aria-label={t('app.projects')}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                </button>
            </div>
          </header>

          {/* VISUALIZER - Desktop Position (Top of Chat Column) */}
          <div 
            className="hidden md:block bg-[#F8FAFC] border-b border-gray-200 shadow-inner p-4 relative"
            style={{ height: `${visualizerHeight}%`, minHeight: '200px' }}
          >
             <div className="absolute top-4 left-4 z-10">
                <div className="flex items-center gap-1.5 mt-0.5 px-2 py-1 bg-white/50 backdrop-blur rounded-full border border-white/50">
                   <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                   <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Nano Banana</span>
                </div>
             </div>
             <ChiltonVisualizer 
                images={session.generatedImages}
                onGenerate={() => handleGenerateVisual()}
                isGenerating={isVisualizing}
                hasItems={session.bom.length > 0}
            />
          </div>

          {/* DRAG HANDLE */}
          <div 
            className="hidden md:flex h-3 w-full cursor-row-resize items-center justify-center hover:bg-indigo-50 group -mt-1.5 z-30 relative"
            onMouseDown={startResizing}
            aria-label="Resize Visualizer"
          >
             <div className="w-16 h-1 rounded-full bg-gray-300 group-hover:bg-indigo-300 transition-colors shadow-sm"></div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-white">
            {session.messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
                <div className="w-16 h-16 bg-white border border-gray-200 rounded-[24px] flex items-center justify-center text-indigo-600 shadow-sm">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-slate-800">{t('welcome.title')}</h3>
                  <p className="text-gray-500 mt-2 text-sm leading-relaxed">{t('welcome.subtitle')}</p>
                </div>
                {aiStatus === 'offline' && (
                     <div className="bg-amber-50 text-amber-800 text-xs px-4 py-3 rounded-xl border border-amber-200 text-left">
                        <strong>Running in Offline Simulation Mode.</strong><br/>
                        {serviceError ? `System: ${serviceError}` : "Check API Key or Network Connection."}
                    </div>
                )}
                <div className="flex flex-col gap-3 w-full">
                  <button onClick={() => handleSend(t('prompt.votive'))} className="p-4 bg-[#F8FAFC] border border-gray-200 rounded-[20px] hover:border-indigo-300 text-left text-sm transition-all font-medium text-gray-700 hover:shadow-sm">
                    "{t('prompt.votive')}"
                  </button>
                  <button onClick={() => handleSend(t('prompt.gaming'))} className="p-4 bg-[#F8FAFC] border border-gray-200 rounded-[20px] hover:border-indigo-300 text-left text-sm transition-all font-medium text-gray-700 hover:shadow-sm">
                    "{t('prompt.gaming')}"
                  </button>
                </div>
              </div>
            )}
            
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                <div className={`max-w-[90%] rounded-[20px] px-5 py-3.5 border ${
                  m.role === 'user' 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md rounded-br-sm' 
                  : m.content.includes('[SYSTEM ALERT]') 
                    ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-sm'
                    : m.content.includes('[SYSTEM ERROR]')
                    ? 'bg-red-50 text-red-900 border-red-200 shadow-sm' 
                    : 'bg-[#F0F4F9] text-slate-800 border-transparent shadow-sm rounded-bl-sm'
                }`}>
                  {m.attachment && (
                      <div className="mb-3 rounded-xl overflow-hidden border border-white/20 shadow-sm">
                          <img src={m.attachment} alt="User attachment" className="max-w-full max-h-64 object-contain" />
                      </div>
                  )}
                  <div className="text-[14px] leading-relaxed whitespace-pre-wrap font-normal">{m.content}</div>
                  
                  {m.content.includes('[SYSTEM ERROR]') && (
                    <div className="mt-3">
                        <button 
                            onClick={handleRetry}
                            className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-bold hover:bg-red-200 transition-colors flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Retry Request
                        </button>
                    </div>
                  )}

                  <div className={`text-[10px] mt-2 font-medium opacity-40 ${m.role === 'user' ? 'text-right text-white/70' : 'text-left text-slate-400'}`}>
                    {m.timestamp.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 shadow-sm rounded-full px-4 py-2 flex gap-3 items-center">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {t('status.thinking')}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <footer className="p-4 md:p-6 border-t border-gray-100 bg-white shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.02)]">
            <div className="relative flex flex-col gap-2">
              {pendingAttachment && (
                  <div className="relative inline-block self-start animate-in fade-in zoom-in duration-200">
                      <div className="h-16 w-16 rounded-xl border border-gray-200 overflow-hidden relative shadow-sm">
                          <img src={pendingAttachment} className="w-full h-full object-cover" alt="Preview" />
                      </div>
                      <button 
                        onClick={() => { setPendingAttachment(null); if(fileInputRef.current) fileInputRef.current.value=''; }}
                        className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-slate-900 shadow-md ring-2 ring-white"
                        aria-label="Remove Attachment"
                      >
                          &times;
                      </button>
                  </div>
              )}
              
              <div className="relative w-full group">
                  <textarea 
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={t('input.placeholder')}
                    rows={1}
                    aria-label="Chat Input"
                    className="w-full pl-6 pr-28 py-4 bg-[#F0F4F9] border-none rounded-[28px] focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all text-sm font-medium resize-none min-h-[56px] max-h-[200px] overflow-y-auto text-slate-800 placeholder-slate-500"
                  />
                  
                  <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        aria-hidden="true"
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-10 h-10 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full flex items-center justify-center transition-all"
                        title="Attach Image"
                        aria-label="Attach Image"
                      >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                      </button>

                      <button 
                        onClick={() => handleSend()}
                        disabled={isThinking || (!input.trim() && !pendingAttachment)}
                        className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-600 transition-all active:scale-95 shadow-sm"
                        aria-label="Send Message"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                      </button>
                  </div>
              </div>
            </div>
          </footer>
        </section>

        {/* Right Pane: BOM (Desktop) or Visuals+BOM (Mobile) */}
        <section 
          className={`
            flex-col bg-white border-l border-gray-200 z-20 relative
            ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}
            ${isBomOpen ? '' : 'md:w-0 md:border-l-0 md:overflow-hidden'}
          `}
          style={{ 
              width: isDesktop && isBomOpen ? rightPaneWidth : undefined,
              transition: isResizingRightRef.current ? 'none' : 'width 300ms ease-in-out' 
          }}
        >
          {/* Resize Handle */}
          <div 
              className="hidden md:flex absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-50 items-center justify-center hover:bg-transparent group"
              onMouseDown={startResizingRight}
              title="Drag to resize"
          >
              <div className="w-1 h-8 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-colors" />
          </div>

          {/* Inner wrapper forces fixed width on desktop to prevent squishing during slide animation */}
          <div className="flex flex-col h-full w-full" style={{ width: '100%' }}>
          <header className="px-6 py-4 border-b border-gray-200 flex flex-col gap-2 bg-white sticky top-0 z-10">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="font-medium text-lg tracking-tight uppercase text-slate-800">{t('app.build')}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{t('status.online')}</span>
                </div>
              </div>
              <div className="text-right flex items-center gap-4">
                <div className="text-[18px] font-mono font-bold text-slate-900 tabular-nums">
                  ${draftingEngine.getTotalCost().toLocaleString()}
                </div>
                 {/* Mobile Project Trigger */}
                 <button 
                    onClick={() => setShowProjects(true)}
                    className="md:hidden p-2 -mr-2 text-gray-400 hover:text-indigo-600"
                    aria-label={t('app.projects')}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                </button>
              </div>
            </div>
          </header>

          {/* VISUALIZER - Mobile Position (Only visible in Blueprint Tab on Mobile) */}
          <div className="md:hidden h-[300px] bg-gray-50 border-b border-gray-100 shadow-inner p-4 relative">
             <div className="absolute top-4 left-4 z-10">
                 <Chip label={isVisualizing ? t('vis.generating') : "Nano Banana"} color={isVisualizing ? "bg-indigo-100 text-indigo-700 animate-pulse" : "bg-yellow-100 text-yellow-800 border border-yellow-200"} />
             </div>
             <ChiltonVisualizer 
                images={session.generatedImages}
                onGenerate={() => handleGenerateVisual()}
                isGenerating={isVisualizing}
                hasItems={session.bom.length > 0}
            />
          </div>

          {/* BOM Section */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#F8FAFC]">
             <button 
                onClick={() => setPartPickerOpen(true)}
                className="w-full py-3 border border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl text-indigo-600 font-medium text-xs uppercase tracking-wider hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 mb-2"
             >
                <span className="text-lg leading-none">+</span> {t('bom.add')}
             </button>

            {session.bom.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40 grayscale pointer-events-none">
                <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t('bom.empty')}</p>
              </div>
            ) : (
              session.bom.map((entry) => {
                const isVirtual = entry.part.sku.startsWith('DRAFT-');
                const sourcing = (entry as any).sourcing; // Cast to access extended prop
                return (
                  <div 
                    key={entry.instanceId} 
                    className={`bg-white border p-4 rounded-[20px] shadow-sm transition-all hover:shadow-md group cursor-default ${
                    isVirtual ? 'border-dashed border-indigo-300 bg-indigo-50/30' : 
                    !entry.isCompatible ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                  }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 cursor-pointer" onClick={() => setSelectedPart(entry)} role="button" tabIndex={0}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${
                              isVirtual ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isVirtual ? 'Design Placeholder' : entry.part.category}
                            </span>
                            {!entry.isCompatible && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase bg-red-100 text-red-600 animate-pulse">
                                    {t('bom.incompatible')}
                                </span>
                            )}
                          </div>
                          <h4 className="font-semibold text-sm text-slate-900 leading-snug hover:text-indigo-600 transition-colors">{entry.part.name}</h4>
                          <div className="text-[10px] text-gray-400 font-mono mt-1 flex items-center gap-1">
                            {entry.part.sku}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className="text-xs font-mono font-bold text-slate-900">
                            {isVirtual ? 'TBD' : `$${(entry.part.price * entry.quantity).toLocaleString()}`}
                          </div>
                          
                          {/* Sourcing Button */}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSourcePart(entry); }}
                                disabled={sourcing?.loading}
                                className={`mt-2 p-1.5 rounded-lg transition-all ${sourcing?.manualUrl ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600'}`}
                                title={sourcing?.manualUrl ? "Custom Source Set" : t('bom.sourcing')}
                                aria-label={t('bom.sourcing')}
                              >
                                {sourcing?.loading ? (
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                )}
                              </button>
                        </div>
                      </div>
                      
                      {/* Sourcing Result */}
                      {(sourcing?.data || sourcing?.manualUrl) && (
                          <div className="mt-3 bg-[#F8FAFC] rounded-xl border border-gray-100 p-2.5">
                             <div className="text-[9px] font-bold text-slate-500 uppercase mb-1 flex justify-between">
                                 <span>Available at:</span>
                                 {sourcing.manualUrl && <span className="text-indigo-600">Custom Link Active</span>}
                             </div>
                             
                             {sourcing.manualUrl ? (
                                 <a href={sourcing.manualUrl} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-indigo-600 truncate hover:underline font-medium">
                                     {sourcing.manualUrl}
                                 </a>
                             ) : (
                                 sourcing.data?.options.map((opt: any, i: number) => (
                                     <a key={i} href={opt.url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-indigo-600 truncate hover:underline font-medium">
                                         {opt.title || opt.source}
                                     </a>
                                 ))
                             )}
                          </div>
                      )}
                      
                      {/* Port Display */}
                      <div className="flex flex-wrap gap-1 mt-3">
                        {entry.part.ports.length > 0 ? entry.part.ports.map((port, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-md text-[8px] text-gray-500 font-bold uppercase">
                            <div className={`w-1.5 h-1.5 rounded-full ${port.gender === 'MALE' ? 'bg-indigo-400' : 'bg-white border border-indigo-300'}`}></div>
                            {port.spec}
                          </div>
                        )) : (
                          <div className="text-[8px] italic text-gray-400 font-bold uppercase tracking-tighter">Ports Inferred from Design Goals</div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between opacity-100 md:opacity-0 group-hover:opacity-100 transition-all">
                         <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-0.5">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleQuantityChange(entry.instanceId, entry.quantity - 1); }}
                                className="w-6 h-6 rounded-md bg-white text-gray-600 hover:text-indigo-600 flex items-center justify-center font-bold shadow-sm"
                                aria-label="Decrease Quantity"
                            >−</button>
                            <span className="text-xs font-mono font-medium w-6 text-center">{entry.quantity}</span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleQuantityChange(entry.instanceId, entry.quantity + 1); }}
                                className="w-6 h-6 rounded-md bg-white text-gray-600 hover:text-indigo-600 flex items-center justify-center font-bold shadow-sm"
                                aria-label="Increase Quantity"
                            >+</button>
                         </div>
                         <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            draftingEngine.removePart(entry.instanceId);
                            setSession(draftingEngine.getSession());
                          }}
                          className="text-[10px] text-red-500 font-bold uppercase hover:bg-red-50 px-2 py-1 rounded transition-colors"
                          aria-label={t('bom.remove')}
                         >
                           {t('bom.remove')}
                         </button>
                      </div>
                  </div>
                );
              })
            )}
          </div>

          <footer className="p-6 bg-white border-t border-gray-200">
            <Button 
                onClick={handleVerifyDesign}
                disabled={session.bom.length === 0}
                className="w-full py-3.5 text-xs font-bold uppercase tracking-[0.15em] bg-slate-900 hover:bg-slate-800 text-white shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
            >
                {isAuditing ? (
                    <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span>{t('audit.running')}</span>
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>{t('audit.button')}</span>
                    </>
                )}
            </Button>
          </footer>
          </div>
        </section>
      </main>

      {/* Mobile Bottom Navigation - Strict Two Tab Experience */}
      <div className="md:hidden h-16 bg-white border-t border-gray-200 flex items-center justify-around shrink-0 z-30 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button 
            onClick={() => setMobileView('chat')} 
            className={`flex flex-col items-center gap-1 p-2 w-1/2 relative ${mobileView === 'chat' ? 'text-indigo-600' : 'text-gray-400'}`}
            aria-label={t('app.title')}
            aria-selected={mobileView === 'chat'}
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            <span className="text-[10px] font-bold uppercase">{t('app.title')}</span>
            {mobileView === 'chat' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-600"></div>}
        </button>

        <div className="w-px h-8 bg-gray-200"></div>

        <button 
            onClick={() => setMobileView('visuals')} 
            className={`flex flex-col items-center gap-1 p-2 w-1/2 relative ${mobileView === 'visuals' ? 'text-indigo-600' : 'text-gray-400'}`}
            aria-label={t('app.build')}
            aria-selected={mobileView === 'visuals'}
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2-2z"></path></svg>
            <span className="text-[10px] font-bold uppercase">{t('app.build')}</span>
            {mobileView === 'visuals' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-600"></div>}
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;