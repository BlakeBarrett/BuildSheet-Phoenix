/**
 * AI Proxy endpoint - proxies requests from the frontend to the configured AI provider.
 * Solves CORS issues by making requests server-side.
 * API keys are kept out of the browser.
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

/**
 * POST /api/v1/ai/chat
 * Proxies chat completions to the configured AI provider.
 */
router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { messages, model, max_tokens, temperature } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid request: messages must be an array' });
        }

        const baseUrl = getEnv('AI_BASE_URL') || 'https://api.openai.com/v1';
        const apiKey = getEnv('AI_KEY');

        if (!apiKey) {
            return res.status(500).json({ error: 'AI_KEY is not configured on the server' });
        }

        // Build the request payload
        const payload: any = {
            model: model || getEnv('AI_MODEL_FAST') || 'gpt-3.5-turbo',
            messages,
            temperature: temperature ?? 0.7,
            max_tokens: max_tokens || 4096,
        };

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
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
        const baseUrl = getEnv('AI_BASE_URL') || 'https://api.openai.com/v1';
        const apiKey = getEnv('AI_KEY');

        if (!apiKey) {
            return res.status(500).json({ error: 'AI_KEY is not configured on the server' });
        }

        const payload: any = {
            model: model || getEnv('AI_MODEL_FAST') || 'gpt-3.5-turbo',
            messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
            temperature: 0.7,
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        };

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                error: `AI API error (${response.status}): ${errorText.substring(0, 500)}`
            });
        }

        const data = await response.json();
        res.json(data);

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
 * Returns the AI configuration (provider, models, keys masking).
 * Public endpoint for app setup.
 */
router.get('/config', (req: Request, res: Response) => {
    res.json({
        provider: getEnv('AI_PROVIDER') || 'on-prem',
        displayName: getEnv('AI_DISPLAY_NAME') || 'BuildSheet AI',
        modelFast: getEnv('AI_MODEL_FAST') || '',
        modelSmart: getEnv('AI_MODEL_SMART') || '',
        modelStructured: getEnv('AI_MODEL_STRUCTURED') || '',
        // Don't expose the full key - just show it's configured
        keyStatus: getEnv('AI_KEY') ? `configured (${getEnv('AI_KEY')!.length} chars)` : 'NOT CONFIGURED',
        imageUrl: getEnv('AI_BASE_URL') || ''
    });
});

export default router;
