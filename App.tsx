import React, { useState, useRef, useEffect, Component, ErrorInfo } from 'react';
import { getDraftingEngine } from './services/draftingEngine.ts';
import { UserService } from './services/userService.ts';
import { ActivityLogService } from './services/activityLogService.ts';
import { DraftingSession, UserMessage, User } from './types.ts';
import { Button, Chip } from './components/Material3UI.tsx';
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

const AppContent: React.FC = () => {
  const { service: aiService, status: aiStatus, error: serviceError } = useService();
  const [draftingEngine] = useState(() => getDraftingEngine());
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [input, setInput] = useState('');
  const [session, setSession] = useState<DraftingSession>(draftingEngine.getSession());
  const [isThinking, setIsThinking] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Visualizer State
  const [isVisualizing, setIsVisualizing] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = UserService.onUserChange((user) => {
      setCurrentUser(user);
      if (user) draftingEngine.updateOwner(user.id);
    });
    return unsubscribe;
  }, [draftingEngine]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Separate function to handle visual generation logic
  const handleGenerateVisual = async (architectReasoning?: string) => {
    // We get the LATEST session state directly from engine, as React state might lag
    const currentSession = draftingEngine.getSession();
    
    // Don't generate if empty (unless we have requirements)
    if (currentSession.bom.length === 0 && !currentSession.designRequirements) return;
    
    // Don't block UI if already running
    if (isVisualizing) return;

    setIsVisualizing(true);
    
    try {
        const partsList = currentSession.bom.map(b => `${b.quantity}x ${b.part.name}`).join(', ');
        
        // Construct a rich prompt that evolves with the design
        let prompt = `Product Design Sketch.`;
        if (currentSession.designRequirements) prompt += ` Context: ${currentSession.designRequirements}.`;
        if (partsList) prompt += ` Visible Components: ${partsList}.`;
        if (architectReasoning) prompt += ` Design Notes: ${architectReasoning.slice(0, 150)}...`; // Truncate to avoid context limit issues
        
        const imageUrl = await aiService.generateProductImage(prompt);
        
        if (imageUrl) {
            draftingEngine.addGeneratedImage(imageUrl, prompt);
            setSession(draftingEngine.getSession()); // Force re-render to show new image in gallery
        }
    } catch (e) {
        console.error("Visual generation failed", e);
    } finally {
        setIsVisualizing(false);
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isThinking) return;

    const userMsg: UserMessage = { role: 'user', content: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    try {
      // Filter out system alerts from history
      const history = messages.filter(m => !m.content.startsWith('[SYSTEM ALERT]')).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }]
      }));

      const architectResponse = await aiService.askArchitect(textToSend, history);
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

      setSession(draftingEngine.getSession());
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: parsed.reasoning || architectResponse, 
        timestamp: new Date() 
      }]);

      // AUTO-GENERATE VISUAL
      // Triggering this asynchronously so we don't block the UI update for the text response
      handleGenerateVisual(parsed.reasoning);

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `[SYSTEM ERROR] ${error.message || "Unknown error occurred during processing."}`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#F3F4F6] text-slate-900 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <nav className="w-20 border-r border-gray-200 bg-white flex flex-col items-center py-8 gap-10 flex-shrink-0 shadow-sm z-10">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-100 ring-4 ring-indigo-50">B</div>
        
        <div className="flex flex-col gap-8 flex-1">
          <button className="text-indigo-600 bg-indigo-50 p-3 rounded-2xl transition-all cursor-default"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></button>
          <button onClick={() => setShowLogs(!showLogs)} className={`p-3 rounded-2xl transition-all ${showLogs ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>
        </div>

        <div className="mt-auto flex flex-col items-center gap-4">
          {currentUser ? (
             <button onClick={() => UserService.logout()} className="relative group">
                <img src={currentUser.avatar} alt="User Avatar" className="w-10 h-10 rounded-full border-2 border-indigo-100 group-hover:border-red-400 transition-colors" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
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

      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Pane: The Architect */}
        <section className={`flex-1 flex flex-col border-r border-gray-200 bg-white transition-all duration-500 ${showLogs ? 'opacity-30 pointer-events-none scale-95' : ''}`}>
          <header className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-xl tracking-tight">BuildArchitect</h1>
                <Chip label="DRAFTING" color="bg-indigo-50 text-indigo-700 border border-indigo-100" />
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
            <div className="flex gap-2 text-xs font-mono text-gray-400">
               {currentUser ? `${currentUser.username}@${session.slug}` : 'guest@local-draft'}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#FAFAFA]">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
                <div className="w-16 h-16 bg-white border border-gray-200 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Architectural Drafting</h3>
                  <p className="text-gray-500 mt-2 text-sm leading-relaxed">Provide high-level design goals. I will infer components, validate ports, and generate a concept render.</p>
                </div>
                {aiStatus === 'offline' && (
                     <div className="bg-amber-50 text-amber-800 text-xs px-4 py-2 rounded-lg border border-amber-200 text-left">
                        <strong>Running in Offline Simulation Mode.</strong><br/>
                        {serviceError ? `System: ${serviceError}` : "Check API Key or Network Connection."}
                    </div>
                )}
                <div className="flex flex-col gap-2 w-full">
                  <button onClick={() => handleSend("Let's build an LED votive light with wireless Qi charging.")} className="p-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 text-left text-xs transition-all font-medium text-gray-600">
                    "Draft an LED votive with wireless charging."
                  </button>
                  <button onClick={() => handleSend("Draft a custom 65% keyboard with silent linear switches.")} className="p-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 text-left text-xs transition-all font-medium text-gray-600">
                    "Architect a silent mechanical keyboard."
                  </button>
                </div>
              </div>
            )}
            
            {messages.map((m, i) => (
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

          <footer className="p-6 border-t border-gray-100 bg-white shadow-inner">
            <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Instruct the Lead Architect..."
                className="w-full pl-5 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all text-sm font-medium"
              />
              <button 
                onClick={() => handleSend()}
                disabled={isThinking || !input.trim()}
                className="absolute right-2 top-2 w-12 h-12 bg-slate-800 text-white rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-slate-900 transition-all active:scale-95 shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
            </div>
          </footer>
        </section>

        {/* GDPR Audit Overlay */}
        {showLogs && (
          <div className="absolute inset-0 z-30 bg-white/40 backdrop-blur-xl flex flex-col p-12 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="max-w-4xl mx-auto w-full flex flex-col h-full bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
               <header className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                 <div>
                   <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Audit Trail Log</h2>
                   <p className="text-[10px] text-gray-400 font-bold">MONITORING ACTIVE • {currentUser ? currentUser.id : 'GUEST_SESSION'}</p>
                 </div>
                 <Button onClick={() => setShowLogs(false)} variant="ghost" className="w-8 h-8 p-0">&times;</Button>
               </header>
               <div className="flex-1 overflow-y-auto p-6 space-y-2 font-mono bg-white">
                 {ActivityLogService.getLogs().map((log) => (
                   <div key={log.id} className="text-[10px] flex gap-3 p-2 border-b border-gray-50 hover:bg-gray-50">
                     <span className="text-gray-400">[{log.timestamp.toLocaleTimeString()}]</span>
                     <span className="font-bold text-indigo-600">{log.action}</span>
                     <span className="text-gray-600 truncate">{JSON.stringify(log.metadata)}</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* Right Pane: Split Visualizer + BOM */}
        <section className="w-[550px] flex flex-col bg-white border-l border-gray-200 z-20">
          <header className="px-8 py-4 border-b border-gray-200 flex flex-col gap-2 bg-white sticky top-0 z-10">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="font-black text-xl tracking-tighter uppercase">Design Visualizer</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                   <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Nano Banana Active</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[18px] font-mono font-black text-slate-900 tabular-nums">
                  ${draftingEngine.getTotalCost().toLocaleString()}
                </div>
              </div>
            </div>
          </header>

          {/* Image Visualizer Section */}
          <div className="h-[60%] p-4 bg-gray-50 border-b border-gray-100 shadow-inner">
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
                return (
                  <div key={entry.instanceId} className={`bg-white border p-4 rounded-xl shadow-sm transition-all hover:border-indigo-300 group ${
                    isVirtual ? 'border-dashed border-indigo-400 bg-indigo-50/10' : 
                    !entry.isCompatible ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200'
                  }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              isVirtual ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isVirtual ? 'Design Placeholder' : entry.part.category}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-slate-900 leading-tight">{entry.part.name}</h4>
                          <div className="text-[9px] text-gray-400 font-mono mt-1">{entry.part.sku}</div>
                        </div>
                        <div className="text-xs font-mono font-bold text-slate-900">
                          {isVirtual ? 'TBD' : `$${(entry.part.price * entry.quantity).toLocaleString()}`}
                        </div>
                      </div>
                      
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
                          onClick={() => {
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
            <Button className="w-full py-4 text-xs font-bold uppercase tracking-[0.2em] bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100">
              Submit Spec for Sourcing
            </Button>
          </footer>
        </section>
      </main>
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