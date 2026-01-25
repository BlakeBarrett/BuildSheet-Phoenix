import React from 'react';
import { Button, Chip } from './Material3UI.tsx';

interface ChiltonVisualizerProps {
  imageUrl?: string | null;
  onGenerate: () => void;
  isGenerating: boolean;
  hasItems: boolean;
}

export const ChiltonVisualizer: React.FC<ChiltonVisualizerProps> = ({ imageUrl, onGenerate, isGenerating, hasItems }) => {
  return (
    <div className="relative h-full w-full bg-[#f8fafc] rounded-2xl overflow-hidden border border-gray-200 shadow-inner group flex items-center justify-center">
      {imageUrl ? (
        <div className="relative w-full h-full flex items-center justify-center bg-white">
            <img 
                src={imageUrl} 
                alt="Generated Design" 
                className="max-h-full max-w-full object-contain"
            />
             <div className="absolute bottom-4 right-4">
                <Button 
                    variant="secondary" 
                    onClick={onGenerate}
                    className="text-[10px] uppercase font-bold shadow-lg bg-white/90 backdrop-blur"
                >
                    {isGenerating ? 'Refining...' : 'Regenerate'}
                </Button>
            </div>
        </div>
      ) : (
        <div className="text-center p-8 max-w-xs">
          <div className="w-16 h-16 bg-yellow-50 text-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-yellow-100 shadow-sm">
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2">Nano Banana Visualizer</h3>
          <p className="text-xs text-gray-400 leading-relaxed mb-6">
            Generate a photorealistic concept of your assembly using the Gemini Nano Banana model.
          </p>
          <Button 
            onClick={onGenerate} 
            variant="primary" 
            className={`w-full shadow-lg shadow-indigo-100 ${!hasItems ? 'opacity-50 cursor-not-allowed' : ''}`}
            // disabled={!hasItems || isGenerating} // Button component doesn't have disabled prop in previous file, handled via click check or styling
          >
             {isGenerating ? 'Generating...' : 'Generate Concept'}
          </Button>
          {!hasItems && (
              <p className="text-[9px] text-red-400 mt-2 font-medium uppercase">Add components to draft first</p>
          )}
        </div>
      )}
      
      <div className="absolute top-4 left-4">
         <Chip label="Nano Banana Model" color="bg-yellow-100 text-yellow-800 border border-yellow-200" />
      </div>
    </div>
  );
};