/**
 * AI Proxy endpoint - proxies requests from the frontend to the configured AI provider.
 * Solves CORS issues by making requests server-side.
 * API keys are kept out of the browser.
 *
 * Security: this router is mounted with requireAuth + generationRateLimit in
 * index.ts. Additionally the server enforces a model allowlist and clamps
 * max_tokens so an authenticated caller cannot substitute arbitrary (costlier)
 * models or unbounded token budgets.
 */

import { Router, Request, Response } from 'express';

const router = Router();

// Read config from environment (already loaded in server)
interface EnvConfig {
    [key: string]: string | undefined;
}

const env: EnvConfig = process.env;

function getEnv(key: string): string {
    return env[key] ?? '';
}

/** Maximum tokens the proxy will forward per request (override via AI_MAX_TOKENS). */
const MAX_TOKENS = Math.min(parseInt(getEnv('AI_MAX_TOKENS') || '8192', 10) || 8192, 32768);

/** Models the proxy is allowed to call — derived from configured env models. */
const ALLOWED_MODELS = new Set<string>(
    [
        'AI_MODEL_FAST',
        'AI_MODEL_SMART',
        'AI_MODEL_STRUCTURED',
        'AI_MODEL_IMAGE',
        'AI_MODEL_AUDIO',
    ]
        .map((k) => getEnv(k))
        .filter(Boolean)
);

function normalizeModel(model: unknown): string | null {
    if (model == null || model === '') return null;
    if (typeof model !== 'string') return null;
    const trimmed = model.trim();
    return trimmed || null;
}

/**
 * Validates and normalizes the model + max_tokens from the client.
 * Returns an error message, or null when valid. Mutates the request body.
 */
function validateProxyRequest(req: Request, res: Response): boolean {
    const { model, max_tokens, temperature } = req.body;

    const requestedModel = normalizeModel(model);
    if (requestedModel !== null && !ALLOWED_MODELS.has(requestedModel)) {
        res.status(400).json({ error: `Model '${requestedModel}' is not allowed by this server.` });
        return false;
    }

    if (max_tokens != null) {
        const n = Number(max_tokens);
        if (!Number.isFinite(n) || n <= 0 || n > MAX_TOKENS) {
            res.status(400).json({ error: `max_tokens must be between 1 and ${MAX_TOKENS}.` });
            return false;
        }
        req.body.max_tokens = Math.floor(n);
    } else {
        req.body.max_tokens = MAX_TOKENS;
    }

    if (temperature != null) {
        const t = Number(temperature);
        if (!Number.isFinite(t) || t < 0 || t > 2) {
            res.status(400).json({ error: 'temperature must be between 0 and 2.' });
            return false;
        }
        req.body.temperature = t;
    }

    return true;
}

/**
 * POST /api/v1/ai/chat
 * Proxies chat completions to the configured AI provider.
 */
router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { messages, model } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid request: messages must be an array' });
        }

        if (!validateProxyRequest(req, res)) return;

        const baseUrl = getEnv('AI_BASE_URL') || 'https://api.openai.com/v1';
        const apiKey = getEnv('AI_KEY');

        if (!apiKey) {
            return res.status(500).json({ error: 'AI_KEY is not configured on the server' });
        }

        // Build the request payload
        const payload: any = {
            model: normalizeModel(model) || getEnv('AI_MODEL_FAST') || 'gpt-3.5-turbo',
            messages,
            temperature: req.body.temperature ?? 0.7,
            max_tokens: req.body.max_tokens,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[AI Proxy] Backend fetch failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: `AI API error (${response.status}): ${errorText.substring(0, 500)}`
                });
            }

            const data = await response.json();
            res.json(data);
        } finally {
            clearTimeout(timeout);
        }
    } catch (error: any) {
        console.error('[AI Proxy] Error proxying chat:', error.message);
        res.status(502).json({
            error: 'Failed to reach AI service',
            details: error.message
        });
    }
});

/**
 * POST /api/v1/ai/generate-structured
 * Proxies structured JSON generation to the configured AI provider.
 */
router.post('/generate-structured', async (req: Request, res: Response) => {
    try {
        const { messages, model } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid request: messages must be an array' });
        }

        if (!validateProxyRequest(req, res)) return;

        const baseUrl = getEnv('AI_BASE_URL') || 'https://api.openai.com/v1';
        const apiKey = getEnv('AI_KEY');

        if (!apiKey) {
            return res.status(500).json({ error: 'AI_KEY is not configured on the server' });
        }

        const payload: any = {
            model: normalizeModel(model) || getEnv('AI_MODEL_FAST') || 'gpt-3.5-turbo',
            messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
            temperature: 0.7,
            max_tokens: req.body.max_tokens,
            response_format: { type: 'json_object' },
            // Qwen3: disable thinking for structured JSON calls so thinking tokens
            // don't appear in content and break JSON.parse downstream.
            enable_thinking: false,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                return res.status(response.status).json({
                    error: `AI API error (${response.status}): ${errorText.substring(0, 500)}`
                });
            }

            const data = await response.json();
            res.json(data);
        } finally {
            clearTimeout(timeout);
        }
    } catch (error: any) {
        console.error('[AI Proxy] Error proxying structured gen:', error.message);
        res.status(502).json({
            error: 'Failed to reach AI service',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/ai/config
 * Returns the AI configuration (provider, models, key masking).
 * Requires auth (mounted with requireAuth).
 */
router.get('/config', (req: Request, res: Response) => {
    res.json({
        provider: getEnv('AI_PROVIDER') === 'hosted' ? 'hosted' : 'openai-compat',
        displayName: getEnv('AI_DISPLAY_NAME') || 'BuildSheet AI',
        modelFast: getEnv('AI_MODEL_FAST') || '',
        modelSmart: getEnv('AI_MODEL_SMART') || '',
        modelStructured: getEnv('AI_MODEL_STRUCTURED') || '',
        keyConfigured: !!getEnv('AI_KEY'),
        imageUrl: getEnv('AI_BASE_URL') || ''
    });
});

export default router;
