import React, { useState, useEffect } from 'react';
import { Button } from './Material3UI.tsx';

export const CookieConsent: React.FC = () => {
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
            We use <strong>Local Storage</strong> to persist your drafting sessions on your device and the <strong>Gemini API</strong> to process your requests. No personal data is sold to third parties.
          </p>
        </div>
        <div className="flex gap-3 shrink-0 w-full md:w-auto">
          <Button onClick={handleDecline} variant="ghost" className="text-[#C4C7C5] hover:text-white hover:bg-white/10 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none">Essential Only</Button>
          <Button onClick={handleAccept} variant="tonal" className="bg-indigo-300 text-indigo-900 hover:bg-indigo-200 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">Accept All</Button>
        </div>
      </div>
    </div>
  );
};