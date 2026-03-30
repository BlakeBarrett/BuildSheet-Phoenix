import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Chip } from './Material3UI.tsx';
import { GeneratedImage } from '../types.ts';

interface ChiltonVisualizerProps {
    images: GeneratedImage[];
    onGenerate: (customPrompt?: string) => void;
    isGenerating: boolean;
    hasItems: boolean;
}

export const ChiltonVisualizer: React.FC<ChiltonVisualizerProps> = ({ images, onGenerate, isGenerating, hasItems }) => {
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [editablePrompt, setEditablePrompt] = useState('');
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const { t, i18n } = useTranslation();

    // Automatically select the latest image when a new one arrives
    const latestImageId = images.length > 0 ? images[images.length - 1].id : null;
    useEffect(() => {
        if (latestImageId) {
            setSelectedImageId(latestImageId);
        }
    }, [latestImageId]);

    const activeImage = selectedImageId
        ? images.find(img => img.id === selectedImageId)
        : images[images.length - 1];

    useEffect(() => {
        if (activeImage) {
            setEditablePrompt(activeImage.prompt?.replace(/^Design concept for:\s*/, '') || '');
            setIsEditingPrompt(false);
        }
    }, [activeImage?.id]);

    const handleDownload = () => {
        if (!activeImage) return;
        const link = document.createElement('a');
        link.href = activeImage.url;
        link.download = `buildsheet-render-${activeImage.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleOpenInFull = () => {
        if (!activeImage) return;
        const newTab = window.open();
        if (newTab) {
            newTab.document.title = activeImage.prompt || 'Generated Image';
            newTab.document.body.style.margin = '0';
            newTab.document.body.style.display = 'flex';
            newTab.document.body.style.justifyContent = 'center';
            newTab.document.body.style.alignItems = 'center';
            newTab.document.body.style.backgroundColor = '#0f172a';
            newTab.document.body.innerHTML = `<img src="${activeImage.url}" alt="${activeImage.prompt?.replace(/"/g, '&quot;') || 'Generated Image'}" style="max-width: 100vw; max-height: 100vh; object-fit: contain;">`;
        }
    };

    return (
        <div className="h-full w-full flex flex-col md:flex-row gap-3">
            {/* Main Viewport */}
            <div className="relative flex-1 bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-sm group flex flex-col min-h-0">

                {/* Header / Meta */}
                <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start pointer-events-none">
                    <Chip
                        label={isGenerating ? t('vis.generating') : "Nano Banana"}
                        icon={isGenerating ? "motion_mode" : "temp_preferences_custom"}
                        color={isGenerating ? "bg-indigo-600 text-white border-transparent animate-pulse" : "bg-white/80 backdrop-blur text-slate-700 border-white shadow-sm"}
                    />

                    {activeImage && (
                        <div className="flex gap-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
                            <IconButton icon="download" onClick={handleDownload} className="bg-white shadow-sm border border-gray-100 text-slate-700 hover:bg-slate-50" />
                            <IconButton icon="open_in_full" onClick={handleOpenInFull} className="bg-white shadow-sm border border-gray-100 text-slate-700 hover:bg-slate-50" />
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
                                alt={activeImage.prompt || "Generated Design"}
                                className="relative max-h-full max-w-full object-contain p-6 transition-transform duration-500 hover:scale-[1.02] drop-shadow-xl"
                            />
                            <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none">
                                <div className="inline-block bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium max-w-[90%] pointer-events-auto flex items-center justify-between gap-2 shadow-lg w-max mx-auto">
                                    {isEditingPrompt ? (
                                        <div className="flex items-center gap-2 w-full">
                                            <input 
                                                type="text" 
                                                value={editablePrompt} 
                                                onChange={(e) => setEditablePrompt(e.target.value)}
                                                className="bg-transparent border-none text-white outline-none w-full min-w-[250px] font-mono text-xs placeholder:text-white/40"
                                                placeholder="Enter custom prompt..."
                                                aria-label="Edit generation prompt"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        setIsEditingPrompt(false);
                                                        onGenerate(editablePrompt);
                                                    } else if (e.key === 'Escape') {
                                                        setIsEditingPrompt(false);
                                                        setEditablePrompt(activeImage.prompt?.replace(/^Design concept for:\s*/, '') || '');
                                                    }
                                                }}
                                            />
                                            <button onClick={() => { setIsEditingPrompt(false); onGenerate(editablePrompt); }} className="text-white hover:text-indigo-300 ml-1 p-1 flex items-center justify-center bg-white/20 rounded-full transition-colors" title="Regenerate with new prompt" aria-label="Regenerate with new prompt">
                                                <span className="material-symbols-rounded text-[14px]" aria-hidden="true">refresh</span>
                                            </button>
                                            <button onClick={() => { setIsEditingPrompt(false); setEditablePrompt(activeImage.prompt?.replace(/^Design concept for:\s*/, '') || ''); }} className="text-white/60 hover:text-white p-1" title="Cancel" aria-label="Cancel editing prompt">
                                                <span className="material-symbols-rounded text-[14px]" aria-hidden="true">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 w-full">
                                            <span className="truncate">{activeImage.prompt}</span>
                                            <button onClick={() => setIsEditingPrompt(true)} className="text-white/60 hover:text-white ml-2 p-1 flex items-center justify-center" title="Edit Prompt & Regenerate">
                                                <span className="material-symbols-rounded text-[14px]">edit</span>
                                            </button>
                                        </div>
                                    )}
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
                    onClick={() => onGenerate()}
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
                        className={`flex-shrink-0 w-24 h-full md:w-full md:h-24 rounded-[20px] overflow-hidden border-2 transition-all relative group ${activeImage?.id === img.id ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md' : 'border-transparent opacity-70 hover:opacity-100 hover:border-gray-200'
                            }`}
                    >
                        <img src={img.url} alt={`Thumbnail: ${img.prompt}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                    </button>
                ))}
            </div>
        </div>
    );
};