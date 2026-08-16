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

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

vi.mock('@google/genai', () => {
  class GoogleGenAI {
    models: any;
    constructor(_config: any) {
      this.models = { generateContent: mockGenerateContent };
    }
  }
  return {
    GoogleGenAI,
    Type: { ARRAY: 'ARRAY', OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN' },
    Modality: {},
    GroundingSupport: {},
    GenerateContentResponse: {},
  };
});

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

describe('ServerCloudAIService.findPartSources (hosted / Google Search grounding)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockGenerateContent.mockReset();
  });

  it('parses grounded JSON options and keeps URLs that match grounding chunks', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify([
        {
          title: 'ATmega328P DIP', url: 'https://www.mouser.com/ProductDetail',
          source: 'Mouser', price: '$4.50', isEstimated: false,
        },
      ]),
      candidates: [{
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://www.mouser.com/ProductDetail', title: 'Mouser' } }],
        },
      }],
    });
    const service = new ServerCloudAIService(makeConfig({ provider: 'hosted' }));

    const options = await service.findPartSources('ATmega328P', 'Embedded', 'en-US', ['mouser.com']);

    expect(options).not.toBeNull();
    expect(options![0]).toMatchObject({
      title: 'ATmega328P DIP',
      url: 'https://www.mouser.com/ProductDetail',
      source: 'Mouser',
      price: '$4.50',
      isEstimated: false,
    });
  });

  it('filters noisy domains from results', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify([
        { title: 'ATmega328P', url: 'https://www.reddit.com/r/arduino/comments/1a2b', source: 'Reddit', price: '$0', isEstimated: false },
        { title: 'ATmega328P', url: 'https://www.digikey.com/en/products/detail', source: 'DigiKey', price: '$4.50', isEstimated: false },
      ]),
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });
    const service = new ServerCloudAIService(makeConfig({ provider: 'hosted' }));

    const options = await service.findPartSources('ATmega328P');

    expect(options).not.toBeNull();
    expect(options!.map(o => o.url)).toEqual(['https://www.digikey.com/en/products/detail']);
  });

  it('falls back to grounding chunks when the model returns no parseable JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Sorry, I could not structure that.',
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://www.mouser.com/ProductDetail/ATmega328P', title: 'ATmega328P - Mouser' } },
          ],
          groundingSupports: [{ groundingChunkIndices: [0], confidenceScores: [0.9] }],
        },
      }],
    });
    const service = new ServerCloudAIService(makeConfig({ provider: 'hosted' }));

    const options = await service.findPartSources('ATmega328P');

    expect(options).not.toBeNull();
    expect(options![0]).toMatchObject({
      title: 'ATmega328P - Mouser',
      url: 'https://www.mouser.com/ProductDetail/ATmega328P',
    });
  });

  it('marks unresolvable URLs as estimated', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify([
        { title: 'ATmega328P', url: 'https://shop.example.com/buy', source: 'Shop', price: '$3.99', isEstimated: false },
      ]),
      candidates: [{
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://www.mouser.com/ProductDetail/ATmega328P', title: 'Mouser' } }],
        },
      }],
    });
    const service = new ServerCloudAIService(makeConfig({ provider: 'hosted' }));

    const options = await service.findPartSources('ATmega328P');

    expect(options).not.toBeNull();
    expect(options![0].url).toBe('https://shop.example.com/buy');
    expect(options![0].isEstimated).toBe(true);
  });
});

describe('ServerCloudAIService.findPartSources (openai-compat)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses a valid JSON array of purchase options', async () => {
    stubFetchOk(JSON.stringify([
      { title: 'LED', url: 'https://adafruit.com/led', source: 'Adafruit', price: '$0.10' },
    ]));
    const service = new ServerCloudAIService(makeConfig());

    const options = await service.findPartSources('Red LED');

    expect(options).not.toBeNull();
    expect(options![0]).toMatchObject({ title: 'LED', url: 'https://adafruit.com/led', isEstimated: true });
  });

  it('returns a Local Market Research Required placeholder when parsing fails', async () => {
    stubFetchOk('not json at all');
    const service = new ServerCloudAIService(makeConfig());

    const options = await service.findPartSources('Red LED');

    expect(options).not.toBeNull();
    expect(options![0].title).toBe('Local Market Research Required');
  });
});
