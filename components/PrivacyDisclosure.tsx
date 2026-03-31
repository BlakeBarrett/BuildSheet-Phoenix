import React, { useState, useEffect } from 'react';

type DisclosureType = 'image-upload' | 'ai-analysis';

const DISCLOSURE_MESSAGES: Record<DisclosureType, { icon: string; title: string; body: string }> = {
  'image-upload': {
    icon: 'photo_camera',
    title: 'Image Processing',
    body: 'Your image will be sent to Google Gemini for analysis. It is processed in-session only and is never used to train AI models. See our Privacy Policy for details.',
  },
  'ai-analysis': {
    icon: 'psychology',
    title: 'AI Analysis',
    body: 'Your project data will be sent to Google Gemini for analysis. Data is processed under contractual necessity and is never used for model training.',
  },
};

const STORAGE_PREFIX = 'buildsheet_disclosure_';

function hasDismissed(type: DisclosureType): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + type) === 'dismissed';
  } catch {
    return false;
  }
}

function setDismissed(type: DisclosureType) {
  try {
    localStorage.setItem(STORAGE_PREFIX + type, 'dismissed');
  } catch { /* noop */ }
}

/**
 * Show a just-in-time privacy disclosure. Returns true if the user has already
 * dismissed this disclosure type (no UI shown). Call `triggerDisclosure` to show.
 */
export function usePrivacyDisclosure() {
  const [active, setActive] = useState<DisclosureType | null>(null);

  const triggerDisclosure = (type: DisclosureType): Promise<void> => {
    if (hasDismissed(type)) return Promise.resolve();
    return new Promise(resolve => {
      setActive(type);
      // Auto-dismiss after showing
      const handleDismiss = () => {
        setDismissed(type);
        setActive(null);
        resolve();
      };
      // Store the dismiss handler so the component can call it
      (window as any).__privacyDisclosureDismiss = handleDismiss;
    });
  };

  return { active, triggerDisclosure };
}

interface PrivacyDisclosureToastProps {
  type: DisclosureType | null;
}

export const PrivacyDisclosureToast: React.FC<PrivacyDisclosureToastProps> = ({ type }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (type) {
      setVisible(true);
    }
  }, [type]);

  if (!type || !visible) return null;

  const msg = DISCLOSURE_MESSAGES[type];

  const handleDismiss = () => {
    setVisible(false);
    const dismiss = (window as any).__privacyDisclosureDismiss;
    if (dismiss) {
      dismiss();
      delete (window as any).__privacyDisclosureDismiss;
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] max-w-md w-full px-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white rounded-[20px] shadow-xl border border-gray-200 p-4 flex gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-indigo-100 flex items-center justify-center shrink-0">
          <span className="material-symbols-rounded text-indigo-600" aria-hidden="true">{msg.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{msg.title}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{msg.body}</p>
        </div>
        <button
          onClick={handleDismiss}
          className="self-start text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-1"
          aria-label="Dismiss"
        >
          <span className="material-symbols-rounded text-lg">close</span>
        </button>
      </div>
    </div>
  );
};
