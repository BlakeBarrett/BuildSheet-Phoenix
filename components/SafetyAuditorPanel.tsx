import React, { useState } from 'react';
import { BOMEntry, AdvancedValidationOption } from '../types.ts';
import { AuditAction } from '../services/aiTypes.ts';
import { IconButton, Button, Chip } from './Material3UI.tsx';

interface SafetyAuditorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  auditResult?: string;
  auditActions?: AuditAction[];
  isAuditing: boolean;
  onRunAudit: () => void;
  onApplyActions: () => void;
  isApplyingAudit: boolean;
  bom: BOMEntry[];
  advancedValidations: AdvancedValidationOption[];
  onToggleValidation: (id: string) => void;
  onAddCustomValidation: (label: string) => void;
  onUpdateValidationMetadata: (id: string, metadata: string) => void;
}

export const SafetyAuditorPanel: React.FC<SafetyAuditorPanelProps> = ({
  isOpen,
  onClose,
  auditResult,
  auditActions,
  isAuditing,
  onRunAudit,
  onApplyActions,
  isApplyingAudit,
  bom,
  advancedValidations,
  onToggleValidation,
  onAddCustomValidation,
  onUpdateValidationMetadata,
}) => {
  const [customLabel, setCustomLabel] = useState('');

  if (!isOpen) return null;

  const addActions = auditActions?.filter(a => a.type === 'addPart') || [];
  const removeActions = auditActions?.filter(a => a.type === 'removePart') || [];
  const hasActions = (auditActions?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[140] bg-slate-900/50 backdrop-blur-sm flex items-end lg:items-center justify-center p-0 lg:p-4" role="dialog" aria-modal="true" aria-labelledby="safety-title" onClick={onClose}>
      <div className="bg-white rounded-t-[32px] lg:rounded-[32px] shadow-2xl w-full lg:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 lg:zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex justify-between items-start border-b border-gray-100 bg-gradient-to-r from-red-50 to-orange-50">
          <div>
            <h3 id="safety-title" className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <span className="material-symbols-rounded text-red-600" aria-hidden="true">verified_user</span>
              Safety &amp; Compliance Auditor
            </h3>
            <p className="text-xs text-slate-500 mt-1">Validate your BOM against engineering standards and custom checks.</p>
          </div>
          <IconButton icon="close" onClick={onClose} title="Close" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Validation Checks Configuration */}
          <div className="p-6 border-b border-gray-100">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Validation Checks</h4>
            <div className="space-y-2">
              {advancedValidations.map(v => (
                <div key={v.id}>
                  <label className="flex items-center gap-3 p-2 rounded-[12px] hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={v.enabled}
                      onChange={() => onToggleValidation(v.id)}
                      className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">{v.label}</span>
                    {v.kind === 'custom' && (
                      <Chip label="Custom" color="bg-violet-100 text-violet-700 border-transparent" />
                    )}
                  </label>
                  {v.id === 'vin-lookup' && v.enabled && (
                    <div className="ml-9 mt-1 mb-2">
                      <input
                        type="text"
                        value={v.metadata || ''}
                        onChange={e => onUpdateValidationMetadata(v.id, e.target.value.toUpperCase())}
                        placeholder="Enter VIN (e.g. 1HGCM82633A004352)"
                        maxLength={17}
                        className="w-full p-2 bg-slate-50 border border-gray-200 rounded-xl text-sm font-mono tracking-wider focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                      {v.metadata && v.metadata.length > 0 && v.metadata.length !== 17 && (
                        <p className="text-[11px] text-amber-600 mt-1 ml-1">VINs are 17 characters ({v.metadata.length}/17)</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add custom check */}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                placeholder="Add custom check (e.g., 'ISO 26262 compliance')"
                className="flex-1 p-2 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && customLabel.trim()) {
                    onAddCustomValidation(customLabel.trim());
                    setCustomLabel('');
                  }
                }}
              />
              <Button
                variant="tonal"
                onClick={() => {
                  if (customLabel.trim()) {
                    onAddCustomValidation(customLabel.trim());
                    setCustomLabel('');
                  }
                }}
                disabled={!customLabel.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Run Audit */}
          <div className="p-6 border-b border-gray-100">
            <Button
              variant="primary"
              onClick={onRunAudit}
              disabled={isAuditing || bom.length === 0}
              icon={isAuditing ? 'sync' : 'play_arrow'}
              className={`w-full ${isAuditing ? 'animate-pulse' : ''}`}
            >
              {isAuditing ? 'Running Audit...' : `Run Audit (${bom.length} parts)`}
            </Button>
          </div>

          {/* Audit Results */}
          {auditResult && (
            <div className="p-6 space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Audit Results</h4>

              {/* Summary text */}
              <div className="prose prose-sm max-w-none text-slate-700 bg-slate-50 p-4 rounded-[16px] border border-gray-100 max-h-60 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{auditResult}</pre>
              </div>

              {/* Actions summary */}
              {hasActions && (
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">Recommended Changes</h4>

                  {removeActions.length > 0 && (
                    <div className="space-y-1">
                      {removeActions.map((a, i) => (
                        <div key={`rm-${i}`} className="flex items-start gap-2 p-2 bg-red-50 rounded-[12px]">
                          <span className="material-symbols-rounded text-red-500 text-sm mt-0.5" aria-hidden="true">remove_circle</span>
                          <div>
                            <p className="text-sm font-medium text-red-800">{a.name || a.instanceId}</p>
                            <p className="text-xs text-red-600">{a.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {addActions.length > 0 && (
                    <div className="space-y-1">
                      {addActions.map((a, i) => (
                        <div key={`add-${i}`} className="flex items-start gap-2 p-2 bg-emerald-50 rounded-[12px]">
                          <span className="material-symbols-rounded text-emerald-500 text-sm mt-0.5" aria-hidden="true">add_circle</span>
                          <div>
                            <p className="text-sm font-medium text-emerald-800">{a.name}</p>
                            <p className="text-xs text-emerald-600">{a.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="primary"
                    onClick={onApplyActions}
                    disabled={isApplyingAudit}
                    icon={isApplyingAudit ? 'sync' : 'auto_fix_high'}
                    className={`w-full ${isApplyingAudit ? 'animate-pulse' : ''}`}
                  >
                    {isApplyingAudit ? 'Applying Changes...' : `Apply ${auditActions?.length} Changes`}
                  </Button>
                </div>
              )}

              {!hasActions && (
                <div className="text-center py-4">
                  <span className="material-symbols-rounded text-emerald-500 text-3xl" aria-hidden="true">check_circle</span>
                  <p className="text-sm text-emerald-700 font-medium mt-1">No changes recommended — your BOM looks good!</p>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!auditResult && !isAuditing && (
            <div className="p-8 text-center">
              <span className="material-symbols-rounded text-slate-300 text-5xl" aria-hidden="true">shield</span>
              <p className="text-sm text-slate-500 mt-3">Configure your checks above and run an audit to validate your build.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
