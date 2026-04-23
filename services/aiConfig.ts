/**
 * AI provider configuration.
 * Reads provider, base URL, and model names from the runtime environment,
 * allowing the backend LLM to be swapped without code changes.
 *
 * Supported providers:
 *   - 'gemini'            — Google Gemini via @google/genai SDK (default for backward compat)
 *   - 'openai-compatible' — Any OpenAI-compatible REST endpoint
 */

export type AiProvider = 'gemini' | 'openai-compatible';

function readEnv(key: string): string | undefined {
    // 1. Runtime injection via env-config.js (Cloud Run)
    // @ts-ignore
    const runtimeVal = (typeof window !== 'undefined' && window._env_) ? (window._env_ as any)[key] : undefined;
    if (runtimeVal && runtimeVal !== '' && runtimeVal !== 'undefined') return runtimeVal;

    // 2. process.env (Vite define or Node)
    // @ts-ignore
    const processVal = (typeof process !== 'undefined' && process.env) ? (process.env as any)[key] : undefined;
    if (processVal && processVal !== '' && processVal !== 'undefined') return processVal;

    // 3. import.meta.env (Vite)
    // @ts-ignore
    const metaVal = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env as any)[key] : undefined;
    if (metaVal && metaVal !== '' && metaVal !== 'undefined') return metaVal;

    return undefined;
}

/** The active LLM provider. Defaults to 'gemini' for backward compatibility. */
export function getAiProvider(): AiProvider {
    const val = readEnv('AI_PROVIDER');
    if (val === 'openai-compatible') return 'openai-compatible';
    return 'gemini';
}

/** Base URL for OpenAI-compatible providers (e.g. https://api.openai.com/v1). */
export function getAiBaseUrl(): string {
    return readEnv('AI_BASE_URL') ?? 'https://api.openai.com/v1';
}

// ---------------------------------------------------------------------------
// Model names — default to current cloud model IDs; override via env vars.
// ---------------------------------------------------------------------------

/** Fast model for everyday generation tasks (chat, QA protocols, audit apply, component ID). */
export const MODEL_FAST: string = readEnv('AI_MODEL_FAST') ?? 'gemini-3-flash-preview';

/** Smart/pro model for reasoning-heavy tasks (design verification, assembly plans, enclosures, fab briefs). */
export const MODEL_SMART: string = readEnv('AI_MODEL_SMART') ?? 'gemini-3.1-pro-preview';

/** Model for structured-JSON and search-grounded procurement tasks. */
export const MODEL_STRUCTURED: string = readEnv('AI_MODEL_STRUCTURED') ?? 'gemini-2.5-flash';

/** Model for image generation. */
export const MODEL_IMAGE: string = readEnv('AI_MODEL_IMAGE') ?? 'gemini-2.5-flash-image';

/** Model for audio/video AR guidance. */
export const MODEL_AUDIO: string = readEnv('AI_MODEL_AUDIO') ?? 'gemini-2.5-flash-native-audio-preview-12-2025';

/** Human-readable display name shown in the UI for the active cloud AI service. */
export function getCloudAiDisplayName(): string {
    return readEnv('AI_DISPLAY_NAME') ?? 'BuildSheet AI';
}

/**
 * Base URL for provider-specific image generation API.
 * For DashScope (Wan2.6): https://dashscope-intl.aliyuncs.com/api/v1
 */
export function getAiImageBaseUrl(): string {
    return readEnv('AI_IMAGE_BASE_URL') ?? 'https://dashscope-intl.aliyuncs.com/api/v1';
}
