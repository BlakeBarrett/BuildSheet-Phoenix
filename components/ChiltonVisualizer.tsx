import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from './Material3UI.tsx';
import { GeneratedImage } from '../types.ts';

interface ChiltonVisualizerProps {
    images: GeneratedImage[];
    onGenerate: (customPrompt?: string) => void;
    isGenerating: boolean;
    hasItems: boolean;
}

interface ImageCellProps {
    img: GeneratedImage;
    isSelected: boolean;
    onClick: () => void;
    onDownload: () => void;
    onOpenFull: () => void;
    isGenerating: boolean;
    onGenerate: () => void;
}

const ImageCell: React.FC<ImageCellProps> = ({ img, isSelected, onClick, onDownload, onOpenFull, isGenerating, onGenerate }) => {
    return (
        <button
            onClick={onClick}
            className={`flex-shrink-0 w-[85vw] sm:w-[60vw] md:w-[45vw] lg:w-[35vw] xl:w-[30vw] relative rounded-[24px] overflow-hidden border-2 transition-all group flex flex-col min-h-0 ${
                isSelected
                    ? 'border-indigo-600 shadow-lg'
                    : 'border-transparent opacity-50 hover:opacity-100 hover:border-gray-200'
            }`}
        >
            {/* Background Image */}
            <div className="flex-1 relative bg-[#F4F7FC] overflow-hidden">
                <img
                    src={img.url}
                    alt={img.prompt || "Generated Design"}
                    className="w-full h-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.02]"
                />

                {/* Top overlay with model badge */}
                <div className="absolute top-4 left-4 z-10">
                    <Chip
                        label="Model"
                        icon="temp_preferences_custom"
                        color="bg-white/80 backdrop-blur text-slate-700 border-white shadow-sm"
                    />
                </div>

                {/* Hover actions */}
                <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDownload(); }}
                        className="w-9 h-9 rounded-xl bg-white/90 backdrop-blur border border-gray-100 shadow-sm flex items-center justify-center text-slate-700 hover:bg-white hover:scale-110 transition-all"
                        title="Download"
                        aria-label="Download image"
                    >
                        <span className="material-symbols-rounded text-[18px]">download</span>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenFull(); }}
                        className="w-9 h-9 rounded-xl bg-white/90 backdrop-blur border border-gray-100 shadow-sm flex items-center justify-center text-slate-700 hover:bg-white hover:scale-110 transition-all"
                        title="Open full size"
                        aria-label="Open full size"
                    >
                        <span className="material-symbols-rounded text-[18px]">open_in_full</span>
                    </button>
                </div>

                {/* Bottom prompt bar */}
                <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none">
                    <div className="inline-block bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium max-w-[90%] pointer-events-auto flex items-center justify-between gap-2 shadow-lg w-max mx-auto">
                        <span className="truncate">{img.prompt}</span>
                    </div>
                </div>
            </div>
        </button>
    );
};

export const ChiltonVisualizer: React.FC<ChiltonVisualizerProps> = ({ images, onGenerate, isGenerating, hasItems }) => {
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [promptText, setPromptText] = useState('');
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [editDraft, setEditDraft] = useState('');
    const { t } = useTranslation();

    // Automatically select the latest image when a new one arrives
    const latestImageId = images.length > 0 ? images[images.length - 1].id : null;
    useEffect(() => {
        if (latestImageId) {
            setSelectedImageId(latestImageId);
        }
    }, [latestImageId]);

    // activeImage is computed from selectedImageId + images
    const activeImage = selectedImageId
        ? images.find(img => img.id === selectedImageId)
        : images[images.length - 1];

    // Sync prompt text whenever active image changes
    useEffect(() => {
        if (activeImage?.prompt && !isEditingPrompt) {
            setPromptText(activeImage.prompt);
        }
    }, [activeImage, isEditingPrompt]);

    const handleDownload = (img: GeneratedImage) => {
        const link = document.createElement('a');
        link.href = img.url;
        link.download = `buildsheet-render-${img.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleOpenInFull = (img: GeneratedImage) => {
        const newTab = window.open();
        if (newTab) {
            newTab.document.title = img.prompt || 'Generated Image';
            newTab.document.body.style.margin = '0';
            newTab.document.body.style.display = 'flex';
            newTab.document.body.style.justifyContent = 'center';
            newTab.document.body.style.alignItems = 'center';
            newTab.document.body.style.backgroundColor = '#0f172a';
            newTab.document.body.innerHTML = `<img src="${img.url}" alt="${img.prompt?.replace(/"/g, '&quot;') || t('visual.generatedImageAlt')}" style="max-width: 100vw; max-height: 100vh; object-fit: contain;">`;
        }
    };

    const handleGenerate = () => {
        const promptToUse = editDraft.trim() || promptText;
        onGenerate(promptToUse || undefined);
    };

    const handlePromptClick = () => {
        setEditDraft(promptText);
        setIsEditingPrompt(true);
    };

    const handlePromptSubmit = () => {
        setPromptText(editDraft);
        setIsEditingPrompt(false);
    };

    const handlePromptKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handlePromptSubmit();
        }
        if (e.key === 'Escape') {
            setIsEditingPrompt(false);
        }
    };

    return (
        <div className="h-full w-full flex flex-col min-h-0 min-w-0">
            {/* Full-height horizontal filmstrip */}
            <div className="flex-1 flex overflow-x-auto scrollbar-hide px-4 py-3 gap-4 min-h-0">
                {/* New button */}
                <div className="flex-shrink-0 w-[140px] flex flex-col items-center gap-2">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !hasItems}
                        className="flex-shrink-0 w-[140px] h-[80px] rounded-[20px] border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center gap-1 text-indigo-400 hover:bg-indigo-100 hover:border-indigo-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                        aria-label={t('visual.new')}
                    >
                        <div className={`w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${isGenerating ? 'animate-spin' : ''}`}>
                            <span className="material-symbols-rounded text-indigo-500 text-[22px]">{isGenerating ? 'refresh' : 'add_photo_alternate'}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">{t('visual.new')}</span>
                    </button>
                    {/* Prompt text field */}
                    <div className="w-[140px] flex-shrink-0" onClick={handlePromptClick}>
                        {isEditingPrompt ? (
                            <textarea
                                autoFocus
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onBlur={handlePromptSubmit}
                                onKeyDown={handlePromptKeyDown}
                                placeholder="Enter prompt..."
                                className="w-full h-20 px-2 py-1.5 text-[11px] text-slate-700 bg-white/90 border border-indigo-200 rounded-[8px] resize-none outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 placeholder:text-slate-400"
                                aria-label="Generation prompt"
                            />
                        ) : (
                            <p className="text-[11px] text-slate-500 leading-relaxed text-left cursor-text hover:bg-indigo-50 rounded-[8px] px-2 py-1.5 transition-colors line-clamp-4">
                                {activeImage?.prompt || 'No prompt yet'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Image cells */}
                {images.slice().reverse().map((img) => (
                    <ImageCell
                        key={img.id}
                        img={img}
                        isSelected={activeImage?.id === img.id}
                        onClick={() => setSelectedImageId(img.id)}
                        onDownload={() => handleDownload(img)}
                        onOpenFull={() => handleOpenInFull(img)}
                        isGenerating={isGenerating}
                        onGenerate={() => onGenerate()}
                    />
                ))}
            </div>
        </div>
    );
};
