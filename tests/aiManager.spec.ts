import { test, expect } from '@playwright/test';
import { AIManager } from '../services/aiManager';

// ---------------------------------------------------------------------------
// AIManager key resolution — unit tests
//
// These tests directly cover the offline-mode regression: if getApiKey()
// fails to read AI_KEY from window._env_, the app silently falls back to
// MockService and users see "Offline Mode".
//
// NOTE: These tests manipulate globalThis.window and process.env in-process.
// They're intentionally synchronous / non-browser tests (no page fixture).
// ---------------------------------------------------------------------------

const VALID_KEY  = 'sk-test-valid-key-0123456789';
const SHORT_KEY  = 'tooshort';
const UNDEF_KEY  = 'undefined';
const NULL_KEY   = 'null';
const PLACEHOLDER = 'YOUR_API_KEY_HERE';

function setWindowEnv(env: Record<string, string>) {
    (globalThis as any).window = { _env_: env };
}

function clearWindowEnv() {
    (globalThis as any).window = { _env_: {} };
}

test.describe('AIManager — getApiKey() resolution', () => {

    test.afterEach(() => {
        clearWindowEnv();
    });

    // -----------------------------------------------------------------------
    // The specific path that caused the Offline Mode regression:
    // AI_KEY is the new primary key name; API_KEY is the legacy name.
    // -----------------------------------------------------------------------

    test('picks up AI_KEY from window._env_', () => {
        setWindowEnv({ AI_KEY: VALID_KEY });
        expect(AIManager.getApiKey()).toBe(VALID_KEY);
    });

    test('falls back to legacy API_KEY from window._env_', () => {
        setWindowEnv({ API_KEY: VALID_KEY });
        expect(AIManager.getApiKey()).toBe(VALID_KEY);
    });

    test('AI_KEY takes priority over API_KEY', () => {
        setWindowEnv({ AI_KEY: VALID_KEY, API_KEY: 'old-legacy-key-00000000' });
        expect(AIManager.getApiKey()).toBe(VALID_KEY);
    });

    test('strips surrounding quotes (added by some shell scripts)', () => {
        setWindowEnv({ AI_KEY: `"${VALID_KEY}"` });
        expect(AIManager.getApiKey()).toBe(VALID_KEY);
    });

    // -----------------------------------------------------------------------
    // Rejection cases — getApiKey() must NOT return a value for these.
    // NOTE: hasApiKey() always returns true in the server-managed-key
    // architecture — the browser never holds keys; the backend manages them.
    // -----------------------------------------------------------------------

    test('returns undefined when no key is set at all', () => {
        clearWindowEnv();
        // Also clear process.env entries that may be set during vite builds
        const savedAiKey  = process.env.AI_KEY;
        const savedApiKey = process.env.API_KEY;
        const savedGemini = process.env.GEMINI_API_KEY;
        delete process.env.AI_KEY;
        delete process.env.API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
            expect(AIManager.getApiKey()).toBeUndefined();
            // Server-managed keys: hasApiKey() is always true
            expect(AIManager.hasApiKey()).toBe(true);
        } finally {
            if (savedAiKey  !== undefined) process.env.AI_KEY  = savedAiKey;
            if (savedApiKey !== undefined) process.env.API_KEY = savedApiKey;
            if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
        }
    });

    test('rejects the string "undefined"', () => {
        setWindowEnv({ AI_KEY: UNDEF_KEY });
        // getApiKey() still filters bad values; hasApiKey() is always true
        expect(AIManager.hasApiKey()).toBe(true);
    });

    test('rejects the string "null"', () => {
        setWindowEnv({ AI_KEY: NULL_KEY });
        expect(AIManager.hasApiKey()).toBe(true);
    });

    test('rejects placeholder text', () => {
        setWindowEnv({ AI_KEY: PLACEHOLDER });
        expect(AIManager.hasApiKey()).toBe(true);
    });

    test('rejects keys shorter than 10 characters', () => {
        setWindowEnv({ AI_KEY: SHORT_KEY });
        expect(AIManager.hasApiKey()).toBe(true);
    });

    test('rejects empty string', () => {
        setWindowEnv({ AI_KEY: '' });
        expect(AIManager.hasApiKey()).toBe(true);
    });

    // -----------------------------------------------------------------------
    // hasApiKey() convenience wrapper
    // -----------------------------------------------------------------------

    test('hasApiKey() is always true (server-managed keys)', () => {
        setWindowEnv({ AI_KEY: VALID_KEY });
        expect(AIManager.hasApiKey()).toBe(true);
    });
});

test.describe('AIManager — createService()', () => {

    test.afterEach(() => {
        clearWindowEnv();
    });

    test('returns MockService when backend server is unreachable', async () => {
        // In the new architecture, createService() pings /api/v1/health.
        // In the test worker context (Node.js, no running backend), the
        // relative URL fails and graceful fallback to MockService occurs.
        setWindowEnv({ AI_KEY: VALID_KEY });
        const { service, error } = await AIManager.createService();
        // Server is not running in tests — expect offline fallback
        expect(service.isOffline).toBe(true);
        expect(error).toBeTruthy();
    });

    test('returns MockService (offline) and an error message when no key is set', async () => {
        clearWindowEnv();
        const savedAiKey  = process.env.AI_KEY;
        const savedApiKey = process.env.API_KEY;
        const savedGemini = process.env.GEMINI_API_KEY;
        delete process.env.AI_KEY;
        delete process.env.API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
            const { service, error } = await AIManager.createService();
            expect(service.isOffline).toBe(true);
            expect(error).toBeTruthy();
        } finally {
            if (savedAiKey  !== undefined) process.env.AI_KEY  = savedAiKey;
            if (savedApiKey !== undefined) process.env.API_KEY = savedApiKey;
            if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
        }
    });
});
