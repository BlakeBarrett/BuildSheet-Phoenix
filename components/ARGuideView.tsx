
import React, { useRef, useEffect, useState } from 'react';
import { AssemblyPlan } from '../types.ts';
import { AIService } from '../services/aiTypes.ts';
import { Button } from './Material3UI.tsx';

interface ARGuideViewProps {
  plan: AssemblyPlan;
  aiService: AIService;
  onClose: () => void;
}

export const ARGuideView: React.FC<ARGuideViewProps> = ({ plan, aiService, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [guidance, setGuidance] = useState("Initializing AR Engine...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (err) {
        setGuidance("Camera access denied.");
      }
    }
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !aiService.getARGuidance || isProcessing) return;

    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    setIsProcessing(true);
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
    try {
        const res = await aiService.getARGuidance(dataUrl, currentStep, plan);
        setGuidance(res);
    } catch (e) {
        setGuidance("Error analyzing frame.");
    } finally {
        setIsProcessing(false);
    }
  };

  // Run analysis every 5 seconds
  useEffect(() => {
    const interval = setInterval(captureFrame, 5000);
    return () => clearInterval(interval);
  }, [currentStep, isProcessing]);

  const stepInfo = plan.steps.find(s => s.stepNumber === currentStep);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-80" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative z-10 flex-1 flex flex-col p-6">
            <div className="flex justify-between items-start">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl max-w-xs">
                    <h3 className="text-white font-bold text-lg">Step {currentStep}</h3>
                    <p className="text-white/80 text-sm mt-1">{stepInfo?.description}</p>
                    <div className="mt-2 flex gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500 text-white px-2 py-1 rounded">🔧 {stepInfo?.requiredTool}</span>
                    </div>
                </div>
                <button onClick={onClose} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl">&times;</button>
            </div>

            <div className="mt-auto mb-8">
                <div className="bg-white rounded-[24px] p-6 shadow-2xl border-t-4 border-indigo-500 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Live AI Guidance</span>
                    </div>
                    <p className="text-slate-800 text-lg font-medium leading-tight">
                        {guidance}
                    </p>
                    <div className="flex gap-2 mt-6">
                        <Button 
                            variant="tonal" 
                            className="flex-1"
                            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                            disabled={currentStep === 1}
                        >
                            Previous
                        </Button>
                        <Button 
                            variant="primary" 
                            className="flex-1"
                            onClick={() => setCurrentStep(prev => Math.min(plan.steps.length, prev + 1))}
                            disabled={currentStep === plan.steps.length}
                        >
                            Next Step
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        {/* HUD Elements */}
        <div className="absolute inset-0 pointer-events-none border-[20px] border-indigo-500/10 flex items-center justify-center">
            <div className="w-48 h-48 border border-white/30 rounded-full opacity-20" />
        </div>
    </div>
  );
};
