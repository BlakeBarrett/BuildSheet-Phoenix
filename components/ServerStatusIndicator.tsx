/**
 * ServerStatusIndicator — shows a banner when the backend AI service is unreachable.
 *
 * Polls the API client's health endpoint every 30 seconds.
 * When the server is down, shows a subtle amber banner with a retry button.
 */
import React, { useState, useEffect, useCallback } from 'react';

export const useServerHealth = () => {
    const [online, setOnline] = useState(true);
    const [checking, setChecking] = useState(false);

    const check = useCallback(async () => {
        if (checking) return;
        setChecking(true);
        try {
            const resp = await fetch('/api/v1/health');
            setOnline(resp.ok);
        } catch {
            setOnline(false);
        } finally {
            setChecking(false);
        }
    }, [checking]);

    useEffect(() => {
        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, [check]);

    return { online, check };
};

export const ServerStatusIndicator: React.FC<{ online: boolean; onRetry: () => void }> = ({ online, onRetry }) => {
    return (
        <div
            className={`server-connection-status flex items-center gap-2 text-xs font-medium ${online ? 'bg-emerald-50 text-emerald-700 px-3 py-1' : 'bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2'}`}
            role="status"
            aria-live="polite"
            aria-label={online ? 'Server connection OK' : 'Server connection lost'}
        >
            <span className={`w-2 h-2 rounded-full shrink-0 ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true"></span>
            <span>{online ? 'AI Service Online' : 'AI service temporarily unavailable'}</span>
            {!online && (
                <button
                    onClick={onRetry}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
                    aria-label="Retry server connection"
                >
                    <span className="material-symbols-rounded text-[16px]" aria-hidden="true">refresh</span>
                    Retry
                </button>
            )}
        </div>
    );
};
