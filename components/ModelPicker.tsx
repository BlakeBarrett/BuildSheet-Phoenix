import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useModels, ModelInfo } from '../services/modelManager.ts';
import { IconButton } from './Material3UI.tsx';

interface ModelPickerProps {
  baseUrl: string;
  currentModel: string;
  visionModel: string;
  onModelChange: (model: string, isVision: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  baseUrl,
  currentModel,
  visionModel,
  onModelChange,
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const { models, loading, error, refreshModels } = useModels(baseUrl);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          buttonRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => (prev < models.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          if (focusedIndex >= 0 && models[focusedIndex]) {
            const model = models[focusedIndex];
            onModelChange(model.id, model.isVision);
            onClose();
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(models.length - 1);
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, models, focusedIndex, onClose, onModelChange]);

  // Reset focus when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = models.findIndex(m => m.id === currentModel);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, models, currentModel]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[role="option"]');
      const focusedItem = items[focusedIndex] as HTMLElement;
      if (focusedItem) {
        focusedItem.scrollIntoView({ block: 'nearest' });
        focusedItem.focus();
      }
    }
  }, [focusedIndex]);

  const handleModelSelect = (model: ModelInfo) => {
    onModelChange(model.id, model.isVision);
    onClose();
    buttonRef.current?.focus();
  };

  // Find current model info
  const currentModelInfo = models.find(m => m.id === currentModel);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute left-full ml-2 top-0 w-72 bg-white rounded-[20px] shadow-xl border border-gray-100 overflow-hidden z-50"
      role="dialog"
      aria-label={t('modelPicker.title')}
      aria-modal="true"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-800">
            {t('modelPicker.title')}
          </h3>
          <button
            onClick={() => refreshModels(true)}
            disabled={loading}
            className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 flex items-center gap-1"
            aria-label={t('modelPicker.refresh')}
          >
            <span className={`material-symbols-rounded text-sm ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            {loading ? t('modelPicker.loading') : t('modelPicker.refresh')}
          </button>
        </div>
        
        {/* Current model display */}
        {currentModelInfo && (
          <div className="mt-2 text-xs text-slate-500">
            {t('modelPicker.current')}: {currentModelInfo.name}
            {currentModelInfo.isVision && (
              <span className="ml-1 text-indigo-600" aria-label={t('modelPicker.visionCapable')}>
                ({t('modelPicker.vision')})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Model list */}
      <div 
        className="max-h-64 overflow-y-auto py-2"
        role="listbox"
        aria-label={t('modelPicker.selectModel')}
      >
        {error ? (
          <div className="px-4 py-3 text-sm text-rose-600">
            {t('modelPicker.error.title')}: {error}
          </div>
        ) : models.length === 0 ? (
          <div className="px-4 py-3 text-sm text-slate-500">
            {loading ? t('modelPicker.loading') : t('modelPicker.noModels')}
          </div>
        ) : (
          models.map((model, index) => {
            const isCurrent = model.id === currentModel;
            const isVision = model.isVision;
            const isFocused = index === focusedIndex;

            return (
              <button
                key={model.id}
                role="option"
                aria-selected={isCurrent}
                tabIndex={isFocused ? 0 : -1}
                onClick={() => handleModelSelect(model)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`w-full px-4 py-3 text-left flex items-center justify-between transition-colors ${
                  isCurrent 
                    ? 'bg-indigo-50 text-indigo-900' 
                    : isFocused 
                      ? 'bg-gray-50 text-slate-800'
                      : 'text-slate-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {model.name}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {model.id}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-2">
                  {isVision && (
                    <span 
                      className="material-symbols-rounded text-indigo-500 text-lg"
                      aria-label={t('modelPicker.visionCapable')}
                      title={t('modelPicker.visionCapable')}
                    >
                      visibility
                    </span>
                  )}
                  {isCurrent && (
                    <span 
                      className="material-symbols-rounded text-emerald-500 text-lg"
                      aria-label={t('modelPicker.selected')}
                    >
                      check_circle
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer with legend */}
      <div className="px-4 py-2 bg-slate-50 border-t border-gray-100 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="material-symbols-rounded text-indigo-500 text-sm">visibility</span>
          <span>{t('modelPicker.visionLegend')}</span>
        </div>
      </div>
    </div>
  );
};

// Compact model picker button for sidebar
interface ModelPickerButtonProps {
  baseUrl: string;
  currentModel: string;
  visionModel: string;
  onModelChange: (model: string, isVision: boolean) => void;
}

export const ModelPickerButton: React.FC<ModelPickerButtonProps> = ({
  baseUrl,
  currentModel,
  visionModel,
  onModelChange
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { models } = useModels(baseUrl);
  
  const currentModelInfo = models.find(m => m.id === currentModel);
  const displayName = currentModelInfo?.name || shortenModelName(currentModel);
  const isVision = currentModelInfo?.isVision || false;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-[16px] transition-colors group"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('modelPicker.selectModel')}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-rounded text-slate-400 text-lg group-hover:text-slate-600">
            smart_toy
          </span>
          <span className="text-xs font-medium text-slate-600 truncate">
            {displayName}
          </span>
        </div>
        
        <div className="flex items-center gap-1 ml-2">
          {isVision && (
            <span 
              className="material-symbols-rounded text-indigo-500 text-sm"
              aria-label={t('modelPicker.visionCapable')}
            >
              visibility
            </span>
          )}
          <span className="material-symbols-rounded text-slate-400 text-sm">
            {isOpen ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </button>

      <ModelPicker
        baseUrl={baseUrl}
        currentModel={currentModel}
        visionModel={visionModel}
        onModelChange={(model, isVision) => {
          onModelChange(model, isVision);
          setIsOpen(false);
        }}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
};

// Helper function for shortened names
function shortenModelName(fullName: string): string {
  return fullName
    .replace(/^(openai|google|meta|mistralai|anthropic|microsoft|nvidia|qwen)\//i, '')
    .replace(/-instruct$/i, '')
    .replace(/-chat$/i, '')
    .slice(0, 20) + (fullName.length > 20 ? '...' : '');
}
