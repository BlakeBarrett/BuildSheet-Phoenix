import React, { useState } from 'react';
import { Button, IconButton } from './Material3UI.tsx';
import { redirectToCheckout } from '../services/stripeCheckout.ts';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onLogin?: () => void;
}

const PRO_BENEFITS = [
  { icon: 'all_inclusive', label: 'Unlimited Projects', description: 'Create as many hardware projects as you need' },
  { icon: 'view_in_ar', label: 'AR Assembly Guide', description: 'Step-by-step augmented reality build guidance' },
  { icon: 'mic', label: 'Greasy Hands Voice Mode', description: 'Hands-free voice commands while you build' },
  { icon: 'chat', label: 'Unlimited Architect Messages', description: 'No caps on AI-assisted design conversations' },
  { icon: 'health_and_safety', label: 'Unlimited Audits & Plans', description: 'Run as many validations and assembly plans as you need' },
  { icon: 'output', label: 'Full Export Suite', description: 'JSON, CSV, PDF, and CAD (OpenSCAD) exports' },
];

type BillingCycle = 'monthly' | 'annual';

function env(key: string): string {
  return (import.meta.env[key] as string)
    ?? (window as any)._env_?.[key]
    ?? '';
}

const STRIPE_PRICES: Record<BillingCycle, string> = {
  monthly: env('VITE_STRIPE_PRO_MONTHLY_PRICE_ID'),
  annual: env('VITE_STRIPE_PRO_ANNUAL_PRICE_ID'),
};

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, isAuthenticated, onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [billing, setBilling] = useState<BillingCycle>('annual');

  if (!isOpen) return null;

  const selectedPriceId = STRIPE_PRICES[billing];

  const handleUpgrade = async () => {
    if (!isAuthenticated) {
      onLogin?.();
      return;
    }
    if (!selectedPriceId) {
      setError('Stripe is not configured. Please contact support.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await redirectToCheckout(selectedPriceId);
    } catch (e: any) {
      setError(e.message || 'Failed to start checkout.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={onClose}>
      <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-start bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-t-[32px]">
          <div>
            <h3 id="upgrade-title" className="text-2xl font-bold tracking-tight">Upgrade to Pro</h3>
            <p className="text-indigo-100 text-sm font-medium mt-1">Unlock your full engineering potential</p>
          </div>
          <IconButton icon="close" onClick={onClose} title="Close" className="text-white/70 hover:text-white hover:bg-white/20" />
        </div>

        {/* Billing toggle */}
        <div className="px-8 pt-6 pb-2">
          <div className="flex bg-slate-100 rounded-[16px] p-1" role="radiogroup" aria-label="Billing cycle">
            <button
              role="radio"
              aria-checked={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-[12px] transition-all ${billing === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Monthly
            </button>
            <button
              role="radio"
              aria-checked={billing === 'annual'}
              onClick={() => setBilling('annual')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-[12px] transition-all flex items-center justify-center gap-1.5 ${billing === 'annual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Annual
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Benefits list */}
        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-4">
          {PRO_BENEFITS.map((b, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-[14px] bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="material-symbols-rounded text-indigo-600 text-[20px]" aria-hidden="true">{b.icon}</span>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">{b.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{b.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 space-y-3">
          {error && (
            <div className="text-xs text-rose-600 font-medium bg-rose-50 p-3 rounded-[12px] flex items-center gap-2" role="alert">
              <span className="material-symbols-rounded text-[16px]" aria-hidden="true">error</span>
              {error}
            </div>
          )}
          <Button
            variant="primary"
            onClick={handleUpgrade}
            disabled={isLoading}
            className="w-full h-14 text-base font-bold bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg"
            icon={isLoading ? 'sync' : isAuthenticated ? 'rocket_launch' : 'login'}
          >
            {isLoading ? 'Redirecting to checkout...' : isAuthenticated ? `Upgrade — ${billing === 'annual' ? 'Annual' : 'Monthly'}` : 'Sign In to Upgrade'}
          </Button>
          <p className="text-[11px] text-slate-400 text-center">Cancel anytime. Powered by Stripe.</p>
        </div>
      </div>
    </div>
  );
};
