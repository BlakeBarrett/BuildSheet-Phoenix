/**
 * Tests for ServerCloudAIService chat resilience.
 *
 * Focus: the architect chat path must NEVER hard-fail when the verified-facts
 * enrichment (Firestore) is unavailable. Verified facts are an enhancement —
 * chat must degrade gracefully and still return the AI response.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServerCloudAIService } from '../services/cloudAiService.js';
import type { AiConfig } from '../services/types.js';

function makeConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai-compat',
    baseUrl: 'http://mock.test/v1',
    imageBaseUrl: 'http://mock.test/image/v1',
    displayName: 'Test AI',
    apiKey: 'test-key-123',
    searchApiKey: '',
    models: {
      fast: 'model-fast',
      smart: 'model-smart',
      structured: 'model-structured',
      image: 'model-image',
      audio: 'model-audio',
    },
    ...overrides,
  };
}

function stubFetchOk(content: string) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  })));
}

function failingFactService() {
  return {
    searchFacts: vi.fn(async () => {
      throw new Error('Could not load the default credentials');
    }),
  } as any;
}

describe('ServerCloudAIService.askArchitect (openai-compat)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the AI response even when verified-facts lookup throws (fail-open)', async () => {
    stubFetchOk('Here is your build.');
    const service = new ServerCloudAIService(makeConfig(), failingFactService());

    const result = await service.askArchitect('Build me a LED blinker', []);

    expect(result.text).toBe('Here is your build.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns the AI response when fact lookup succeeds but returns nothing', async () => {
    stubFetchOk('No facts, no problem.');
    const factService = { searchFacts: vi.fn(async () => []) } as any;
    const service = new ServerCloudAIService(makeConfig(), factService);

    const result = await service.askArchitect('Hello', []);

    expect(result.text).toBe('No facts, no problem.');
  });

  it('works when no fact service is configured at all', async () => {
    stubFetchOk('Plain AI response.');
    const service = new ServerCloudAIService(makeConfig());

    const result = await service.askArchitect('Hello', []);

    expect(result.text).toBe('Plain AI response.');
  });

  it('passes the configured model and API key to the provider', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    }));
    vi.stubGlobal('fetch', mockFetch);
    const service = new ServerCloudAIService(makeConfig(), failingFactService());

    await service.askArchitect('Hello', []);

    const [url, init] = mockFetch.mock.calls[0] as unknown as [string, any];
    expect(url).toBe('http://mock.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key-123');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('model-fast');
  });
});
