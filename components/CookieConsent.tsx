import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Material3UI.tsx';

/** Check if user has given full (non-essential) consent */
export const hasFullConsent = (): boolean => {
  try {
    return localStorage.getItem('buildsheet_consent') === 'full';
  } catch {
    return false;
  }
};

/** Check if any consent decision has been made */
export const hasConsentDecision = (): boolean => {
  try {
    return localStorage.getItem('buildsheet_consent') !== null;
  } catch {
    return false;
  }
};

/** Clear all user data from localStorage and IndexedDB (GDPR right to erasure) */
export const clearAllUserData = async (): Promise<void> => {
  // Clear localStorage
  const keysToKeep: string[] = []; // keep nothing
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key);
    }
  });

  // Clear IndexedDB databases
  if ('indexedDB' in window) {
    const databases = await window.indexedDB.databases?.() || [];
    databases.forEach(db => {
      if (db.name) window.indexedDB.deleteDatabase(db.name);
    });
  }
};

export const CookieConsent: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('buildsheet_consent');
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('buildsheet_consent', 'full');
    setVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('buildsheet_consent', 'essential');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div role="alertdialog" aria-labelledby="cookie-heading" aria-describedby="cookie-desc" className="fixed bottom-0 left-0 right-0 z-[200] p-4 flex justify-center pointer-events-none">
      <div className="bg-[#1E1E1E] text-[#F0F4F9] rounded-[24px] shadow-2xl p-6 max-w-3xl w-full flex flex-col md:flex-row items-start md:items-center gap-6 pointer-events-auto border border-white/10 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex-1">
          <h3 id="cookie-heading" className="text-lg font-bold mb-2 flex items-center gap-2">
            <span className="material-symbols-rounded text-indigo-300" aria-hidden="true">cookie</span>
            Privacy & Data Control
          </h3>
          <p id="cookie-desc" className="text-sm text-[#C4C7C5] leading-relaxed">
            We use <strong>{t('cookie.localStorage')}</strong> to save your projects on-device. Project descriptions, images, and BOM data are sent to our <strong>{t('cookie.aiProvider')}</strong> for AI processing. No personal data is sold to third parties.
          </p>
        </div>
        <div className="flex gap-3 shrink-0 w-full md:w-auto">
          <Button onClick={handleDecline} variant="ghost" className="text-[#C4C7C5] hover:text-white hover:bg-white/10 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none">{t('cookie.essentialOnly')}</Button>
          <Button onClick={handleAccept} variant="tonal" className="bg-indigo-300 text-indigo-900 hover:bg-indigo-200 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">{t('cookie.acceptAll')}</Button>
        </div>
      </div>
    </div>
  );
};