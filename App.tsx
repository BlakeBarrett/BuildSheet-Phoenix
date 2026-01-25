import React, { useState, useRef, useEffect, Component, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import { getDraftingEngine } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { DraftingSession, UserMessage, User, BOMEntry } from './types.ts';
import { Button, Chip, Card } from './components/Material3UI.tsx';
import { ChiltonVisualizer } from './components/ChiltonVisualizer.tsx';
import { useService } from './contexts/ServiceContext.tsx';

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
        <div className="h-screen w-full flex items-center justify-center bg-slate-900 text-white p-8">
            <div className="max-w-lg">
                <h1 className="text-2xl font-bold text-red-500 mb-4">System Critical Failure</h1>
                <p className="mb-4 text-slate-300">The application encountered an unrecoverable error.</p>
                <pre className="bg-black/50 p-4 rounded text-xs font-mono overflow-auto border border-red-900/50">{this.state.error?.message}</pre>
                <button onClick={() => window.location.reload()} className="mt-6 px-4 py-2 bg-slate-700 rounded hover:bg-slate-600">Reboot System</button>
            </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProjectManager: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    onLoad: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    activeId: string;
    engine: any; 
}> = ({ isOpen, onClose, onLoad, onNew, onDelete, activeId, engine }) => {
    const [projects, setProjects] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            setProjects(engine.getProjectList());
        }
    }, [isOpen, engine]);

    if (!isOpen) return null;

    return (
        <div className="absolute left-0 md:left-20 top-0 bottom-0 w-full md:w-72 bg-white border-r border-gray-200 z-50 shadow-2xl animate-in slide-in-from-left duration-200 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-bold text-slate-800">Your Projects</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <button 
                    onClick={onNew}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 font-bold text-sm hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                    <span>+</span> New Project
                </button>

                {projects.map(p => (
                    <div 
                        key={p.id} 
                        className={`group relative p-3 rounded-xl text-left border transition-all ${
                            p.id === activeId 
                            ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                            : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md'
                        }`}
                    >
                        <div onClick={() => onLoad(p.id)} className="cursor-pointer">
                            <div className="font-bold text-sm text-slate-800 truncate">{p.name || 'Untitled'}</div>
                            <div className="text-[10px] text-gray-400 font-mono mt-1 flex justify-between">
                                <span>{new Date(p.lastModified).toLocaleDateString()}</span>
                                <span>{p.preview}</span>
                            </div>
                        </div>
                        {p.id !== activeId && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(p.id); setProjects(engine.getProjectList()); }}
                                className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                             </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 text-center">Projects are saved locally to this device.</p>
            </div>
        </div>
    );
};

const AuditModal: React.FC<{ isOpen: boolean; onClose: () => void; result: string | null; isRunning: boolean }> = ({ isOpen, onClose, result, isRunning }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRunning ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-green-100 text-green-600'}`}>
                           {isRunning ? (
                               <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           ) : (
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                           )}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">System Integrity Verification</h3>
                            <p className="text-xs text-gray-500">{isRunning ? "Gemini 3.0 Pro Thinking..." : "Audit Complete"}</p>
                        </div>
                    </div>
                    {!isRunning && <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>}
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {isRunning ? (
                        <div className="space-y-4">
                            <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-5/6 animate-pulse"></div>
                            <p className="text-center text-xs text-gray-400 mt-8">Analyzing voltage rails, mechanical constraints, and logical compatibility...</p>
                        </div>
                    ) : (
                        <div className="prose prose-sm prose-slate max-w-none">
                            <ReactMarkdown>{result || ''}</ReactMarkdown>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <Button onClick={onClose} variant="primary" className={isRunning ? 'opacity-50 pointer-events-none' : ''}>
                        {isRunning ? 'Auditing...' : 'Close Report'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

const FabricationModal: React.FC<{ isOpen: boolean; onClose: () => void; result: string | null; isRunning: boolean; partName: string }> = ({ isOpen, onClose, result, isRunning, partName }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRunning ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-blue-100 text-blue-600'}`}>
                           {isRunning ? (
                               <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           ) : (
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                           )}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Manufacturing Brief</h3>
                            <p className="text-xs text-gray-500">Drafting fabrication spec for: <strong>{partName}</strong></p>
                        </div>
                    </div>
                    {!isRunning && <button onClick={onClose} className="text-gray-400 hover:text-slate-800">&times;</button>}
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    {isRunning ? (
                         <div className="space-y-4">
                            <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div>
                            <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                             <p className="text-center text-xs text-gray-400 mt-8">Inferring layer count, surface finish, and tolerances based on system context...</p>
                        </div>
                    ) : (
                         <div className="prose prose-sm prose-slate max-w-none">
                            <ReactMarkdown>{result || ''}</ReactMarkdown>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    {!isRunning && (
                        <>
                             <Button onClick={() => window.open('https://www.pcbway.com/', '_blank')} variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100">
                                Quote on PCBWay
                            </Button>
                            <Button onClick={() => window.open('https://sendcutsend.com/', '_blank')} variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                                Quote on SendCutSend
                            </Button>
                        </>
                    )}
                    <Button onClick={onClose} variant="primary">Close Brief</Button>
                </div>
            </div>
        </div>
    );
};

const PartDetailModal: React.FC<{ entry: BOMEntry | null; onClose: () => void; onFabricate: (part: any) => void }> = ({ entry, onClose, onFabricate }) => {
    if (!entry) return null;
    const { part, isCompatible, warnings } = entry;
    const isVirtual = part.sku.startsWith('DRAFT-');

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-slate-50">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Chip label={part.category} color={isVirtual ? "bg-indigo-100 text-indigo-700" : "bg-gray-200 text-gray-700"} />
                            {!isCompatible && <Chip label="Incompatible" color="bg-red-100 text-red-700" />}
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 leading-tight">{part.name}</h3>
                        <p className="text-xs font-mono text-gray-400 mt-1">{part.sku}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-slate-800 p-1">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Status Banner */}
                    {(!isCompatible || (warnings && warnings.length > 0)) && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Compatibility Warnings</h4>
                            <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                                {warnings?.map((w, i) => <li key={i}>{w}</li>)}
                                {!isCompatible && <li>Interfaces do not match existing system ports.</li>}
                            </ul>
                        </div>
                    )}

                    {/* Overview */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Overview</h4>
                        <p className="text-sm text-slate-700 leading-relaxed">{part.description}</p>
                        
                        {isVirtual ? (
                            <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase mb-2">Virtual Component</h4>
                                <p className="text-xs text-indigo-600 mb-3">This part was architected by Gemini but does not exist in the parts registry. You can generate a fabrication spec for it.</p>
                                <Button onClick={() => onFabricate(part)} className="w-full justify-center">
                                    Generate Manufacturing Brief
                                </Button>
                            </div>
                        ) : (
                            <div className="mt-3 grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <span className="block text-[10px] text-gray-400 uppercase">Brand</span>
                                    <span className="text-sm font-medium text-slate-800">{part.brand}</span>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <span className="block text-[10px] text-gray-400 uppercase">Unit Price</span>
                                    <span className="text-sm font-medium text-slate-800">${part.price.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ports */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Interface Ports</h4>
                        {part.ports.length > 0 ? (
                            <div className="border border-gray-100 rounded-lg overflow-hidden">
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
                        ) : (
                            <p className="text-sm italic text-gray-400">No explicit ports defined for this component.</p>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <Button onClick={onClose} variant="primary">Close</Button>
                </div>
            </div>
        </div>
    );
};

const AppContent: React.FC = () => {
  const { service: aiService, status: aiStatus, error: serviceError } = useService();
  const [draftingEngine] = useState(() => getDraftingEngine());
  
  // NOTE: We initialize messages from the session now, not empty array
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
  
  // Audit Modal
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  
  // Part Detail & Fabrication
  const [selectedPart, setSelectedPart] = useState<BOMEntry | null>(null);
  const [fabModalOpen, setFabModalOpen] = useState(false);
  const [fabResult, setFabResult] = useState<string | null>(null);
  const [isFabricating, setIsFabricating] = useState(false);
  const [fabPartName, setFabPartName] = useState('');
  
  // Mobile UI State
  const [mobileView, setMobileView] = useState<'chat' | 'visuals'>('chat');
  
  // Visualizer State
  const [isVisualizing, setIsVisualizing] = useState(false);
  
  // Resizable Visualizer State
  const [visualizerHeight, setVisualizerHeight] = useState(45); // Start at 45%
  const leftPaneRef = useRef<HTMLElement>(null);
  const isResizingRef = useRef(false);

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
      // Assume header is ~76px
      const headerOffset = 76;
      const relativeY = e.clientY - paneRect.top - headerOffset;
      
      // Calculate percentage relative to the full pane height
      let percentage = (relativeY / (paneRect.height - headerOffset)) * 100;

      // Constraints: Min 33% (2:1 split), Max 50% (1:1 split)
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

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = UserService.onUserChange((user) => {
      setCurrentUser(user);
      if (user) draftingEngine.updateOwner(user.id);
    });
    return unsubscribe;
  }, [draftingEngine]);

  useEffect(() => { 
      // Only scroll if we are in chat mode (on mobile) or desktop
      if (mobileView === 'chat') {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
      }
  }, [session.messages, mobileView]);

  // Auto-resize textarea
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
    
    // Auto-switch to visual tab on mobile if a new visual is generated
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
    
    // Update Engine Persistence
    draftingEngine.addMessage(userMsg);
    setSession(draftingEngine.getSession()); // Refresh local state
    
    setInput('');
    setPendingAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    setIsThinking(true);

    try {
      // Reconstruct history for the API, handling past images
      const history = session.messages.filter(m => !m.content.startsWith('[SYSTEM ALERT]')).map(m => {
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

      const architectResponse = await aiService.askArchitect(textToSend, history, attachmentToSend || undefined);
      const parsed = aiService.parseArchitectResponse(architectResponse);

      parsed.toolCalls.forEach(call => {
        if (call.type === 'initializeDraft') {
          draftingEngine.initialize(call.name, call.reqs);
        } else if (call.type === 'addPart') {
          draftingEngine.addPart(call.partId, call.qty);
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
      
      // If the user uploaded an image, pass it to Nano Banana to guide the visual
      handleGenerateVisual(parsed.reasoning, attachmentToSend || undefined);

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

  // Project Management Handlers
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
      setSession(draftingEngine.getSession()); // Update in case active project was deleted
  };

  const handleSourcePart = async (entry: any) => {
      if (entry.part.sku.startsWith('DRAFT-')) return; // Can't source virtual parts yet
      
      // Optimistic update to show loading
      const updatedBom = session.bom.map(b => {
          if (b.instanceId === entry.instanceId) {
              return { ...b, sourcing: { loading: true } };
          }
          return b;
      });
      // We don't save loading state to engine persistence, just local state for UI
      setSession({ ...session, bom: updatedBom });

      try {
          const result = await aiService.findPartSources?.(entry.part.name + " " + entry.part.sku);
          if (result) {
             draftingEngine.updatePartSourcing(entry.instanceId, result);
             setSession(draftingEngine.getSession());
          }
      } catch (e) {
          console.error("Sourcing failed", e);
      }
  };

  const handleVerifyDesign = async () => {
      if (!aiService.verifyDesign || session.bom.length === 0) return;
      setAuditOpen(true);
      setIsAuditing(true);
      setAuditResult(null);

      try {
          const report = await aiService.verifyDesign(session.bom, session.designRequirements);
          setAuditResult(report);
      } catch (e) {
          setAuditResult("Audit failed due to connection error.");
      } finally {
          setIsAuditing(false);
      }
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

  return (
    <div className="flex h-[100dvh] w-full bg-[#F3F4F6] text-slate-900 overflow-hidden font-sans relative flex-col md:flex-row">
      <AuditModal 
          isOpen={auditOpen} 
          onClose={() => setAuditOpen(false)} 
          result={auditResult}
          isRunning={isAuditing}
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
      />

      {/* Sidebar Navigation - Hidden on Mobile */}
      <nav className="hidden md:flex w-20 border-r border-gray-200 bg-white flex-col items-center py-8 gap-6 flex-shrink-0 shadow-sm z-20 relative">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-100 ring-4 ring-indigo-50 mb-4">B</div>
        
        <div className="flex flex-col gap-6 flex-1 w-full px-4">
          <button 
            className="w-full aspect-square flex items-center justify-center text-indigo-600 bg-indigo-50 rounded-2xl transition-all cursor-default"
            title="Drafting Mode"
          >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </button>

          <button 
            onClick={() => setShowProjects(!showProjects)}
            className={`w-full aspect-square flex items-center justify-center rounded-2xl transition-all ${showProjects ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-50'}`}
            title="Projects"
          >
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
          </button>

          <button 
            onClick={() => setShowLogs(!showLogs)} 
            className={`w-full aspect-square flex items-center justify-center rounded-2xl transition-all ${showLogs ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-50'}`}
            title="System Logs"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>
        </div>

        <div className="mt-auto flex flex-col items-center gap-4">
          {currentUser ? (
             <button onClick={() => UserService.logout()} className="relative group">
                <img src={currentUser.avatar} alt="User Avatar" className="w-10 h-10 rounded-full border-2 border-indigo-100 group-hover:border-red-400 transition-colors" />
             </button>
          ) : (
            <button 
              onClick={() => UserService.login()}
              className="w-10 h-10 rounded-full bg-white border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
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
        activeId={session.id}
        engine={draftingEngine}
      />

      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Pane: Visualizer (Desktop) + Architect (Chat) */}
        <section ref={leftPaneRef as React.RefObject<HTMLElement>} className={`flex-1 flex flex-col border-r border-gray-200 bg-white transition-all duration-500 ${showLogs ? 'opacity-30 pointer-events-none scale-95' : ''} ${mobileView === 'visuals' ? 'hidden md:flex' : 'flex'}`}>
          <header className="px-6 py-4 md:px-8 md:py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg md:text-xl tracking-tight">BuildArchitect</h1>
                <Chip label={session.name || "Untitled"} color="bg-indigo-50 text-indigo-700 border border-indigo-100" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">{aiService.name}</p>
                <div 
                    className={`flex items-center gap-1.5 transition-all`}
                    title={aiStatus === 'offline' ? 'Offline Mode' : 'Connected'}
                >
                    <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'online' ? 'bg-green-500' : aiStatus === 'offline' ? 'bg-amber-500' : 'bg-gray-300 animate-pulse'}`}></div>
                    {aiStatus === 'offline' && <span className="text-[9px] font-bold text-amber-600 uppercase">SIMULATION</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2 text-xs font-mono text-gray-400 items-center">
                <div className="hidden md:block">
                   {currentUser ? `${currentUser.username}@${session.slug}` : 'guest@local-draft'}
                </div>
                {/* Desktop/Tablet Toggle for BOM */}
                <button 
                  onClick={() => setIsBomOpen(!isBomOpen)}
                  className="hidden md:flex p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all ml-2 border border-transparent hover:border-indigo-100"
                  title={isBomOpen ? "Close BOM Panel" : "Open BOM Panel"}
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
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                </button>
            </div>
          </header>

          {/* VISUALIZER - Desktop Position (Top of Chat Column) */}
          <div 
            className="hidden md:block bg-gray-50 border-b border-gray-200 shadow-inner p-4 relative"
            style={{ height: `${visualizerHeight}%`, minHeight: '200px' }}
          >
             <div className="absolute top-4 left-4 z-10">
                <div className="flex items-center gap-1.5 mt-0.5">
                   <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Nano Banana Active</span>
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
          >
             <div className="w-16 h-1 rounded-full bg-gray-300 group-hover:bg-indigo-300 transition-colors shadow-sm"></div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-[#FAFAFA]">
            {session.messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
                <div className="w-16 h-16 bg-white border border-gray-200 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Hardware System Assembly</h3>
                  <p className="text-gray-500 mt-2 text-sm leading-relaxed">Describe the product you want to build. I will select the correct kit of parts, validate connections, and generate a system visual.</p>
                </div>
                {aiStatus === 'offline' && (
                     <div className="bg-amber-50 text-amber-800 text-xs px-4 py-2 rounded-lg border border-amber-200 text-left">
                        <strong>Running in Offline Simulation Mode.</strong><br/>
                        {serviceError ? `System: ${serviceError}` : "Check API Key or Network Connection."}
                    </div>
                )}
                <div className="flex flex-col gap-2 w-full">
                  <button onClick={() => handleSend("Let's build an LED votive light with wireless Qi charging.")} className="p-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 text-left text-xs transition-all font-medium text-gray-600">
                    "Assemble an LED votive with wireless charging."
                  </button>
                  <button onClick={() => handleSend("Draft a custom 65% keyboard with silent linear switches.")} className="p-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 text-left text-xs transition-all font-medium text-gray-600">
                    "Configure a silent mechanical keyboard."
                  </button>
                </div>
              </div>
            )}
            
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                <div className={`max-w-[90%] rounded-xl px-4 py-3 border ${
                  m.role === 'user' 
                  ? 'bg-slate-800 text-white border-slate-900 shadow-lg' 
                  : m.content.includes('[SYSTEM ALERT]') 
                    ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-sm'
                    : m.content.includes('[SYSTEM ERROR]')
                    ? 'bg-red-50 text-red-900 border-red-200 shadow-sm' 
                    : 'bg-white text-slate-800 border-gray-200 shadow-sm'
                }`}>
                  {m.attachment && (
                      <div className="mb-3 rounded-lg overflow-hidden border border-white/20 shadow-sm">
                          <img src={m.attachment} alt="User attachment" className="max-w-full max-h-64 object-contain" />
                      </div>
                  )}
                  <div className="text-[14px] leading-relaxed whitespace-pre-wrap font-normal">{m.content}</div>
                  <div className={`text-[8px] mt-2 font-mono uppercase tracking-widest opacity-40 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-4 py-2 flex gap-3 items-center">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-indigo-600 rounded-full animate-pulse"></div>
                    <div className="w-1 h-1 bg-indigo-600 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
                    <div className="w-1 h-1 bg-indigo-600 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
                  </div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest italic">
                    {aiService.name} Thinking...
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <footer className="p-4 md:p-6 border-t border-gray-100 bg-white shadow-inner">
            <div className="relative flex flex-col gap-2">
              {pendingAttachment && (
                  <div className="relative inline-block self-start">
                      <div className="h-16 w-16 rounded-lg border border-gray-300 overflow-hidden relative">
                          <img src={pendingAttachment} className="w-full h-full object-cover" alt="Preview" />
                      </div>
                      <button 
                        onClick={() => { setPendingAttachment(null); if(fileInputRef.current) fileInputRef.current.value=''; }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-red-600 shadow-sm"
                      >
                          &times;
                      </button>
                  </div>
              )}
              
              <div className="relative w-full">
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
                    placeholder="Instruct the Lead Architect..."
                    rows={1}
                    className="w-full pl-5 pr-24 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all text-sm font-medium resize-none min-h-[54px] max-h-[200px] overflow-y-auto"
                  />
                  
                  <div className="absolute right-2 top-2 flex gap-1">
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-12 h-12 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center justify-center transition-all"
                        title="Attach Image for Visual Context"
                      >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                      </button>

                      <button 
                        onClick={() => handleSend()}
                        disabled={isThinking || (!input.trim() && !pendingAttachment)}
                        className="w-12 h-12 bg-slate-800 text-white rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-slate-900 transition-all active:scale-95 shadow-md"
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
            flex-col bg-white border-l border-gray-200 z-20 
            transition-all duration-300 ease-in-out
            ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}
            ${isBomOpen ? 'md:w-[450px]' : 'md:w-0 md:border-l-0 md:overflow-hidden'}
          `}
        >
          {/* Inner wrapper forces fixed width on desktop to prevent squishing during slide animation */}
          <div className="flex flex-col h-full w-full md:w-[450px]">
          <header className="px-6 py-4 border-b border-gray-200 flex flex-col gap-2 bg-white sticky top-0 z-10">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="font-black text-xl tracking-tighter uppercase">Bill of Materials</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Live Updates</span>
                </div>
              </div>
              <div className="text-right flex items-center gap-4">
                <div className="text-[18px] font-mono font-black text-slate-900 tabular-nums">
                  ${draftingEngine.getTotalCost().toLocaleString()}
                </div>
                 {/* Mobile Project Trigger */}
                 <button 
                    onClick={() => setShowProjects(true)}
                    className="md:hidden p-2 -mr-2 text-gray-400 hover:text-indigo-600"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                </button>
              </div>
            </div>
          </header>

          {/* VISUALIZER - Mobile Position (Only visible in Blueprint Tab on Mobile) */}
          <div className="md:hidden h-[300px] bg-gray-50 border-b border-gray-100 shadow-inner p-4 relative">
             <div className="absolute top-4 left-4 z-10">
                 <Chip label={isVisualizing ? "Generating..." : "Nano Banana"} color={isVisualizing ? "bg-indigo-100 text-indigo-700 animate-pulse" : "bg-yellow-100 text-yellow-800 border border-yellow-200"} />
             </div>
             <ChiltonVisualizer 
                images={session.generatedImages}
                onGenerate={() => handleGenerateVisual()}
                isGenerating={isVisualizing}
                hasItems={session.bom.length > 0}
            />
          </div>

          {/* BOM Section */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#FBFBFB]">
            {session.bom.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-20 grayscale pointer-events-none">
                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Awaiting Build Sheet Ingestion</p>
              </div>
            ) : (
              session.bom.map((entry) => {
                const isVirtual = entry.part.sku.startsWith('DRAFT-');
                const sourcing = (entry as any).sourcing; // Cast to access extended prop
                return (
                  <div 
                    key={entry.instanceId} 
                    className={`bg-white border p-4 rounded-xl shadow-sm transition-all hover:border-indigo-300 group cursor-default ${
                    isVirtual ? 'border-dashed border-indigo-400 bg-indigo-50/10' : 
                    !entry.isCompatible ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'
                  }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 cursor-pointer" onClick={() => setSelectedPart(entry)}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              isVirtual ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isVirtual ? 'Design Placeholder' : entry.part.category}
                            </span>
                            {!entry.isCompatible && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-100 text-red-500 animate-pulse">
                                    Incompatible
                                </span>
                            )}
                          </div>
                          <h4 className="font-bold text-sm text-slate-900 leading-tight hover:text-indigo-600 transition-colors">{entry.part.name}</h4>
                          <div className="text-[9px] text-gray-400 font-mono mt-1 flex items-center gap-1">
                            {entry.part.sku}
                            <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-slate-900">
                            {isVirtual ? 'TBD' : `$${(entry.part.price * entry.quantity).toLocaleString()}`}
                          </div>
                          
                          {/* Sourcing Button - Only for Real Parts */}
                          {!isVirtual && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSourcePart(entry); }}
                                disabled={sourcing?.loading}
                                className="mt-2 p-1.5 bg-gray-50 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded-lg transition-all"
                                title="Find Purchase Options"
                              >
                                {sourcing?.loading ? (
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                )}
                              </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Sourcing Result */}
                      {sourcing?.data && (
                          <div className="mt-3 bg-gray-50 rounded border border-gray-100 p-2">
                             <div className="text-[10px] font-bold text-slate-700 uppercase mb-1">Available at:</div>
                             {sourcing.data.options.map((opt: any, i: number) => (
                                 <a key={i} href={opt.url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-indigo-600 truncate hover:underline">
                                     {opt.title || opt.source}
                                 </a>
                             ))}
                          </div>
                      )}
                      
                      {/* Port Display */}
                      <div className="flex flex-wrap gap-1 mt-3">
                        {entry.part.ports.length > 0 ? entry.part.ports.map((port, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-[8px] text-gray-500 font-bold uppercase">
                            <div className={`w-1.5 h-1.5 rounded-full ${port.gender === 'MALE' ? 'bg-indigo-400' : 'bg-white border border-indigo-300'}`}></div>
                            {port.spec}
                          </div>
                        )) : (
                          <div className="text-[8px] italic text-gray-400 font-bold uppercase tracking-tighter">Ports Inferred from Design Goals</div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all">
                         <div className="flex items-center gap-3">
                            <button className="text-xs font-black text-gray-300 hover:text-indigo-600 transition-colors">−</button>
                            <span className="text-[10px] font-bold w-4 text-center">{entry.quantity}</span>
                            <button className="text-xs font-black text-gray-300 hover:text-indigo-600 transition-colors">+</button>
                         </div>
                         <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            draftingEngine.removePart(entry.instanceId);
                            setSession(draftingEngine.getSession());
                          }}
                          className="text-[9px] text-red-500 font-bold uppercase hover:bg-red-50 px-2 py-1 rounded transition-colors"
                         >
                           Remove
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
                className="w-full py-4 text-xs font-bold uppercase tracking-[0.2em] bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
            >
                {isAuditing ? (
                    <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span>Running Deep Audit...</span>
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>Verify System Integrity</span>
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
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            <span className="text-[10px] font-bold uppercase">Architect</span>
            {mobileView === 'chat' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-600"></div>}
        </button>

        <div className="w-px h-8 bg-gray-200"></div>

        <button 
            onClick={() => setMobileView('visuals')} 
            className={`flex flex-col items-center gap-1 p-2 w-1/2 relative ${mobileView === 'visuals' ? 'text-indigo-600' : 'text-gray-400'}`}
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            <span className="text-[10px] font-bold uppercase">Blueprint</span>
            {mobileView === 'visuals' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-600"></div>}
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
};

export default App;