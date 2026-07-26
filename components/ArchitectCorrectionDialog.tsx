import React, { useState } from 'react';
import { Button, IconButton } from './Material3UI.tsx';

interface ArchitectCorrectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageContent?: string;
  messageId?: string;
}

export const ArchitectCorrectionDialog: React.FC<ArchitectCorrectionDialogProps> = ({
  isOpen,
  onClose,
  messageContent,
  messageId,
}) => {
  const [category, setCategory] = useState<string>('');
  const [correction, setCorrection] = useState<string>('');
  const [evidence, setEvidence] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>('');

  const categories = [
    { value: 'factual_error', label: 'Factual Error' },
    { value: 'outdated_info', label: 'Outdated Information' },
    { value: 'missing_context', label: 'Missing Context' },
    { value: 'misinterpretation', label: 'Misinterpretation' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = async () => {
    if (!category || !correction) {
      setError('Please fill in the category and correction fields.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        statement: correction,
        category,
        source: evidence || 'user-correction',
        tags: [messageId || 'unknown'],
      };

      const response = await fetch('/api/v1/architect/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Submission failed' }));
        throw new Error(err.error || 'Failed to submit correction');
      }

      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit correction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategory('');
    setCorrection('');
    setEvidence('');
    setSubmitted(false);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[400] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-dialog-title"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-[24px] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-3 flex justify-between items-center border-b border-gray-100">
          <h3 id="correction-dialog-title" className="text-xl font-bold text-slate-800 tracking-tight">
            Report Inaccurate Information
          </h3>
          <IconButton icon="close" onClick={handleClose} title="Close" />
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="material-symbols-rounded text-green-600 text-5xl mb-4" aria-hidden="true">
                check_circle
              </span>
              <h4 className="text-lg font-bold text-slate-800 mb-2">Thank you!</h4>
              <p className="text-sm text-slate-600">
                Your correction has been submitted. We appreciate your feedback.
              </p>
            </div>
          ) : (
            <>
              {/* Category Select */}
              <div>
                <label htmlFor="correction-category" className="block text-sm font-bold text-slate-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="correction-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Correction TextField */}
              <div>
                <label htmlFor="correction-text" className="block text-sm font-bold text-slate-700 mb-2">
                  Your Correction <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="correction-text"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  placeholder="Please provide the correct information..."
                  rows={4}
                  className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Evidence TextField */}
              <div>
                <label htmlFor="correction-evidence" className="block text-sm font-bold text-slate-700 mb-2">
                  Supporting Evidence (optional)
                </label>
                <textarea
                  id="correction-evidence"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="Links, references, or additional context..."
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!submitted && (
          <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-slate-50">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-rounded animate-spin">progress_activity</span>
                  Submitting...
                </span>
              ) : (
                'Submit Correction'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
