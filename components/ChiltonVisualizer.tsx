import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip } from './Material3UI.tsx';
import { GeneratedImage } from '../types.ts';

interface ChiltonVisualizerProps {
  images: GeneratedImage[];
  onGenerate: () => void;
  isGenerating: boolean;
  hasItems: boolean;
}

export const ChiltonVisualizer: React.FC<ChiltonVisualizerProps> = ({ images, onGenerate, isGenerating, hasItems }) => {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const { t, i18n } = useTranslation();

  // Automatically select the latest image when the image list changes
  useEffect(() => {
    if (images.length > 0) {
        setSelectedImageId(images[images.length - 1].id);
    }
  }, [images.length]);

  const activeImage = selectedImageId 
    ? images.find(img => img.id === selectedImageId) 
    : images[images.length - 1];

  const handleDownload = () => {
    if (!activeImage) return;
    const link = document.createElement('a');
    link.href = activeImage.url;
    link.download = `buildsheet-render-${activeImage.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full w-full flex flex-col md:flex-row gap-4">
        {/* Main Viewport */}
        <div className="relative flex-1 bg-[#f8fafc] rounded-2xl overflow-hidden border border-gray-200 shadow-inner group flex items-center justify-center min-h-[200px] md:min-h-0 h-full">
        {activeImage ? (
            <div className="relative w-full h-full flex items-center justify-center bg-white group-hover:bg-gray-50 transition-colors">
                <img 
                    src={activeImage.url} 
                    alt="Generated Design" 
                    className="max-h-full max-w-full object-contain mix-blend-multiply p-4"
                />
                
                {/* Overlay Controls */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                        variant="secondary" 
                        onClick={handleDownload}
                        className="text-[10px] uppercase font-bold shadow-lg bg-white/90 backdrop-blur"
                        aria-label="Save Image"
                    >
                        Save Image
                    </Button>
                </div>

                <div className="absolute bottom-4 left-4 max-w-[80%]">
                    <p className="text-[10px] text-gray-400 bg-white/80 p-2 rounded backdrop-blur border border-gray-100 line-clamp-2">
                        {activeImage.prompt}
                    </p>
                </div>
            </div>
        ) : (
            <div className="text-center p-8 max-w-xs">
            <div className="w-16 h-16 bg-yellow-50 text-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-yellow-100 shadow-sm">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2">Nano Banana Visualizer</h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-6">
                {t('vis.empty')}
            </p>
            {!hasItems && (
                <p className="text-[9px] text-red-400 mt-2 font-medium uppercase">Add components to draft first</p>
            )}
            </div>
        )}
        
        {/* Model Badge */}
        <div className="absolute top-4 left-4">
            <Chip label={isGenerating ? t('vis.generating') : "Nano Banana"} color={isGenerating ? "bg-indigo-100 text-indigo-700 animate-pulse" : "bg-yellow-100 text-yellow-800 border border-yellow-200"} />
        </div>
        </div>

        {/* Gallery Strip - Vertical on Desktop, Horizontal on Mobile */}
        <div className="h-20 w-full md:h-full md:w-28 flex flex-row md:flex-col gap-3 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto pb-2 md:pb-0 md:pl-1 scrollbar-hide snap-x md:snap-y shrink-0">
             <button 
                onClick={onGenerate}
                disabled={isGenerating || !hasItems}
                className="flex-shrink-0 w-20 h-full md:w-full md:h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('vis.new')}
             >
                <div className={`w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center ${isGenerating ? 'animate-spin' : ''}`}>
                    {isGenerating ? (
                         <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <span className="text-lg leading-none">+</span>
                    )}
                </div>
                <span className="text-[9px] font-bold uppercase">{t('vis.new')}</span>
             </button>

            {images.slice().reverse().map((img) => (
                <button
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className={`flex-shrink-0 w-20 h-full md:w-full md:h-20 rounded-xl overflow-hidden border-2 transition-all snap-start relative group ${
                        activeImage?.id === img.id ? 'border-indigo-600 shadow-md ring-2 ring-indigo-100' : 'border-gray-200 opacity-60 hover:opacity-100'
                    }`}
                >
                    <img src={img.url} alt="thumbnail" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] font-mono py-0.5 px-1 truncate">
                        {img.timestamp.toLocaleTimeString(i18n.language, {hour: '2-digit', minute:'2-digit'})}
                    </div>
                </button>
            ))}
        </div>
    </div>
  );
};