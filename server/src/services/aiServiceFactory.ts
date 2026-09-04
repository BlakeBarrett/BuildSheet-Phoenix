/**
 * AI Service Factory — server-side.
 *
 * Creates the appropriate AI service based on environment configuration.
 * This mirrors the client-side AIManager logic but runs server-side where
 * API keys are available securely.
 */

import { ServerCloudAIService } from './cloudAiService.js';
import { VerifiedFactService } from './verifiedFactService.js';
import { getFirestore } from 'firebase-admin/firestore';
import type { ServerAIService } from './types.js';

/**
 * Reads an env var with fallback chain matching the client-side aiConfig.ts pattern.
 */
function env(key: string): string {
  return process.env[key] || '';
}

export function getAiConfig() {
  return {
    // Accept legacy 'on-prem' value as an alias for 'openai-compat'
    provider: (env('AI_PROVIDER') === 'hosted' ? 'hosted' : 'openai-compat') as 'hosted' | 'openai-compat',
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

  // Verified facts are an ENRICHMENT — index.ts explicitly supports starting
  // without Firebase (degraded mode). getFirestore() throws when no app is
  // initialized, which would crash boot; degrade to a fact-less service.
  let factService: VerifiedFactService | undefined;
  try {
    factService = new VerifiedFactService(getFirestore());
  } catch (err: any) {
    console.warn('[AIFactory] Firestore unavailable — starting without verified facts:', err?.message || err);
  }
  return new ServerCloudAIService(config, factService);
}
