/**
 * AI Service Factory — server-side.
 *
 * Creates the appropriate AI service based on environment configuration.
 * This mirrors the client-side AIManager logic but runs server-side where
 * API keys are available securely.
 */

import { ServerCloudAIService } from './cloudAiService.js';
import type { ServerAIService } from './types.js';

/**
 * Reads an env var with fallback chain matching the client-side aiConfig.ts pattern.
 */
function env(key: string): string {
  return process.env[key] || '';
}

export function getAiConfig() {
  return {
    provider: (env('AI_PROVIDER') || 'on-prem') as 'hosted' | 'on-prem',
    baseUrl: env('AI_BASE_URL') || 'https://api.openai.com/v1',
    imageBaseUrl: env('AI_IMAGE_BASE_URL') || 'https://dashscope-intl.aliyuncs.com/api/v1',
    displayName: env('AI_DISPLAY_NAME') || 'BuildSheet AI',
    apiKey: env('AI_KEY') || env('API_KEY') || env('GEMINI_API_KEY') || '',
    searchApiKey: env('SEARCH_API_KEY') || '',
    models: {
      fast: env('AI_MODEL_FAST') || '',
      smart: env('AI_MODEL_SMART') || '',
      structured: env('AI_MODEL_STRUCTURED') || '',
      image: env('AI_MODEL_IMAGE') || '',
      audio: env('AI_MODEL_AUDIO') || '',
    },
  };
}

export function createAiService(): ServerAIService {
  const config = getAiConfig();

  if (!config.apiKey) {
    console.warn('[AIFactory] No API key found — service will operate in degraded mode');
  }

  return new ServerCloudAIService(config);
}
