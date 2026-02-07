import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Chip } from './Material3UI.tsx';
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
    <div className="h-full w-full flex flex-col md:flex-row gap-3">
        {/* Main Viewport */}
        <div className="relative flex-1 bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-sm group flex flex-col min-h-0">
            
            {/* Header / Meta */}
            <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start pointer-events-none">
                <Chip 
                    label={isGenerating ? t('vis.generating') : "Gemini Nano"} 
                    icon={isGenerating ? "motion_mode" : "temp_preferences_custom"}
                    color={isGenerating ? "bg-indigo-600 text-white border-transparent animate-pulse" : "bg-white/80 backdrop-blur text-slate-700 border-white shadow-sm"}
                />
                
                {activeImage && (
                    <div className="flex gap-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
                        <IconButton icon="download" onClick={handleDownload} className="bg-white shadow-sm border border-gray-100 text-slate-700 hover:bg-slate-50" />
                        <IconButton icon="open_in_full" onClick={() => window.open(activeImage.url, '_blank')} className="bg-white shadow-sm border border-gray-100 text-slate-700 hover:bg-slate-50" />
                    </div>
                )}
            </div>

            {/* Canvas */}
            <div className="flex-1 relative flex items-center justify-center bg-[#F4F7FC] overflow-hidden">
                {activeImage ? (
                    <>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] opacity-10"></div>
                        <img 
                            src={activeImage.url} 
                            alt="Generated Design" 
                            className="relative max-h-full max-w-full object-contain p-6 transition-transform duration-500 hover:scale-[1.02] drop-shadow-xl"
                        />
                        <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none">
                             <div className="inline-block bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium max-w-[90%] truncate">
                                {activeImage.prompt}
                             </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center p-6 max-w-sm">
                        <div className="w-16 h-16 bg-indigo-50 text-indigo-400 rounded-[20px] flex items-center justify-center mx-auto mb-3 border border-indigo-100">
                            <span className="material-symbols-rounded text-[32px] opacity-80">broken_image</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">Blank Canvas</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Draft your BOM to generate a concept using Gemini.
                        </p>
                    </div>
                )}
            </div>
        </div>

        {/* Gallery Strip */}
        <div className="h-20 w-full md:h-full md:w-[100px] flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto p-1 scrollbar-hide shrink-0">
             <button 
                onClick={onGenerate}
                disabled={isGenerating || !hasItems}
                className="flex-shrink-0 w-20 h-full md:w-full md:h-24 rounded-[20px] border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center gap-1 text-indigo-400 hover:bg-indigo-100 hover:border-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                aria-label={t('vis.new')}
             >
                <div className={`w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${isGenerating ? 'animate-spin' : ''}`}>
                    <span className="material-symbols-rounded text-indigo-500 text-[20px]">{isGenerating ? 'refresh' : 'add_photo_alternate'}</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-800">New</span>
             </button>

            {images.slice().reverse().map((img) => (
                <button
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className={`flex-shrink-0 w-24 h-full md:w-full md:h-24 rounded-[20px] overflow-hidden border-2 transition-all relative group ${
                        activeImage?.id === img.id ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md' : 'border-transparent opacity-70 hover:opacity-100 hover:border-gray-200'
                    }`}
                >
                    <img src={img.url} alt="thumbnail" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                </button>
            ))}
        </div>
    </div>
  );
};