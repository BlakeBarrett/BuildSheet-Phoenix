import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AssemblyPlan, BOMEntry } from '../types.ts';
import { AIService } from '../services/aiTypes.ts';
import { Button, IconButton } from './Material3UI.tsx';

interface VoiceSessionProps {
  bom: BOMEntry[];
  plan?: AssemblyPlan | null;
  aiService: AIService;
  onClose: () => void;
}

/**
 * "Greasy Hands" Voice Mode — hands-free voice assistant for the shop floor.
 * Uses the browser SpeechRecognition API for STT and SpeechSynthesis for TTS,
 * with the cloud processing the transcribed queries against the current BOM/plan.
 */
export const VoiceSession: React.FC<VoiceSessionProps> = ({ bom, plan, aiService, onClose }) => {
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('Tap the mic and ask about your build.');
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    return () => {
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    // Prefer a clear English voice
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    synthRef.current.speak(utterance);
  }, []);

  const processQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setIsProcessing(true);
    setHistory(prev => [...prev, { role: 'user', text: query }]);

    try {
      const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name} (${b.part.category})`).join(', ');
      const planDigest = plan
        ? plan.steps.map(s => `Step ${s.stepNumber}: ${s.description} (Tool: ${s.requiredTool})`).join('\n')
        : 'No assembly plan generated yet.';

      const contextPrompt = `You are a hands-free voice assistant for a mechanic/builder on the shop floor. Keep answers SHORT and SPOKEN-FRIENDLY (2-3 sentences max). No markdown, no bullet points, no special characters.

CURRENT BUILD (Bill of Materials):
${bomDigest}

ASSEMBLY PLAN:
${planDigest}

USER QUESTION (spoken): ${query}`;

      const result = await aiService.askArchitect(contextPrompt, []);
      const answer = result.text.replace(/[*#`_~]/g, '').replace(/\n+/g, ' ').trim();
      setResponse(answer);
      setHistory(prev => [...prev, { role: 'assistant', text: answer }]);
      speak(answer);
    } catch (e: any) {
      const errMsg = 'Sorry, I couldn\'t process that. Try again.';
      setResponse(errMsg);
      speak(errMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [bom, plan, aiService, speak]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setResponse('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    // Stop TTS while listening
    synthRef.current?.cancel();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
      if (finalTranscript) {
        processQuery(finalTranscript);
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setResponse('Couldn\'t hear you. Tap and try again.');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
  }, [processQuery]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return (
    <div className="fixed inset-0 z-[150] bg-gradient-to-b from-slate-900 to-indigo-950 flex flex-col" role="dialog" aria-modal="true" aria-label={t('voice.title')}>
      {/* Header */}
      <div className="flex justify-between items-center p-6">
        <div>
          <h2 className="text-white text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="material-symbols-rounded text-amber-400" aria-hidden="true">mic</span>
            {t('voice.title')}
          </h2>
          <p className="text-white/50 text-xs mt-0.5">{t('voice.subtitle')}</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white text-xl hover:bg-white/20 transition-colors"
          aria-label={t('voice.closeAria')}
        >
          &times;
        </button>
      </div>

      {/* Conversation history */}
      <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
        {history.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] p-3 rounded-[16px] text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'ml-auto bg-indigo-600 text-white'
                : 'mr-auto bg-white/10 text-white/90'
            }`}
          >
            {msg.text}
          </div>
        ))}
        {isProcessing && (
          <div className="mr-auto bg-white/10 text-white/60 p-3 rounded-[16px] text-sm flex items-center gap-2">
            <span className="material-symbols-rounded animate-spin text-sm">progress_activity</span>
            Thinking...
          </div>
        )}
      </div>

      {/* Response display */}
      <div className="px-6 pb-4">
        <div className="bg-white/5 backdrop-blur rounded-[20px] p-5 border border-white/10">
          <p className="text-white text-lg font-medium leading-relaxed text-center">{response}</p>
          {transcript && isListening && (
            <p className="text-indigo-300 text-sm mt-2 text-center italic">"{transcript}"</p>
          )}
        </div>
      </div>

      {/* Push-to-talk button */}
      <div className="pb-10 pt-4 flex flex-col items-center gap-3">
        <button
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-2xl ${
            isListening
              ? 'bg-red-500 scale-110 ring-4 ring-red-400/30'
              : isProcessing
                ? 'bg-amber-500 animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95'
          }`}
          aria-label={isListening ? 'Release to send' : 'Hold to talk'}
          disabled={isProcessing}
        >
          <span className="material-symbols-rounded text-white text-4xl" aria-hidden="true">
            {isListening ? 'hearing' : isProcessing ? 'sync' : 'mic'}
          </span>
        </button>
        <p className="text-white/40 text-xs font-medium uppercase tracking-wider">
          {isListening ? 'Listening...' : isProcessing ? 'Processing...' : 'Hold to Talk'}
        </p>
      </div>
    </div>
  );
};
