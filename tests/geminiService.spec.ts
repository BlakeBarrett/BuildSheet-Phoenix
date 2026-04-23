
import { test, expect } from '@playwright/test';
import { GeminiService } from '../services/geminiService';
import { CloudAIService } from '../services/cloudAiService';

// ---------------------------------------------------------------------------
// CloudAIService — openai-compatible provider path
//
// These tests exercise the fetch-based branches added for the Qwen/DashScope
// migration. They run in Node (no page fixture) and mock globalThis.fetch so
// no real network calls are made.
// ---------------------------------------------------------------------------

type FetchArgs = { url: string; init: RequestInit };

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const original = globalThis.fetch;
    (globalThis as any).fetch = (url: string, init: RequestInit) => handler(url, init);
    return () => { (globalThis as any).fetch = original; };
}

function chatCompletionsResponse(content: string) {
    return new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

test.describe('CloudAIService — openai-compatible path', () => {

    let restore: () => void;

    test.beforeEach(() => {
        process.env.AI_PROVIDER = 'openai-compatible';
        process.env.AI_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';
    });

    test.afterEach(() => {
        delete process.env.AI_PROVIDER;
        delete process.env.AI_BASE_URL;
        if (restore) restore();
    });

    test('askArchitect POSTs to /chat/completions with bearer token', async () => {
        const calls: FetchArgs[] = [];
        restore = mockFetch((url, init) => {
            calls.push({ url, init });
            return chatCompletionsResponse('addPart("led-5mm", "5mm Red LED", "Component", 5)');
        });

        const service = new CloudAIService('sk-test-key-0123456789');
        const result = await service.askArchitect('Build me an LED circuit', []);

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/chat/completions');
        expect(calls[0].init.headers).toMatchObject({
            'Authorization': 'Bearer sk-test-key-0123456789',
            'Content-Type': 'application/json',
        });
        expect(result.text).toContain('addPart');
    });

    test('askArchitect sends system instruction in messages array', async () => {
        let capturedBody: any;
        restore = mockFetch((url, init) => {
            capturedBody = JSON.parse(init.body as string);
            return chatCompletionsResponse('initializeDraft("LED Circuit", "simple LED")');
        });

        const service = new CloudAIService('sk-test-key-0123456789');
        await service.askArchitect('Build me an LED circuit', []);

        expect(capturedBody.messages[0].role).toBe('system');
        expect(capturedBody.messages.at(-1).role).toBe('user');
        expect(capturedBody.messages.at(-1).content).toContain('LED circuit');
    });

    test('askArchitect converts Gemini history roles (model → assistant)', async () => {
        let capturedBody: any;
        restore = mockFetch((url, init) => {
            capturedBody = JSON.parse(init.body as string);
            return chatCompletionsResponse('Response');
        });

        const service = new CloudAIService('sk-test-key-0123456789');
        const history = [
            { role: 'user',  parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi there' }] },
        ];
        await service.askArchitect('Follow up', history);

        const roles = capturedBody.messages.map((m: any) => m.role);
        expect(roles).not.toContain('model');   // Gemini role must be converted
        expect(roles).toContain('assistant');
    });

    test('generateStructuredJson sends response_format: json_object', async () => {
        let capturedBody: any;
        restore = mockFetch((url, init) => {
            capturedBody = JSON.parse(init.body as string);
            return chatCompletionsResponse('{"price": 12.99, "brand": "Acme"}');
        });

        const service = new CloudAIService('sk-test-key-0123456789');
        await service.generateStructuredJson('price for a 5mm LED', {});

        expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    });

    test('findPartSources returns isEstimated:true results from LLM (no grounding)', async () => {
        restore = mockFetch(() => chatCompletionsResponse(
            JSON.stringify([
                { title: 'Digi-Key 5mm Red LED', url: 'https://digikey.com/p/123', source: 'Digi-Key', price: '0.35' }
            ])
        ));

        const service = new CloudAIService('sk-test-key-0123456789');
        const results = await service.findPartSources('5mm Red LED');

        expect(results).not.toBeNull();
        expect(results!.length).toBeGreaterThan(0);
        expect(results![0].isEstimated).toBe(true);
    });

    test('findLocalSuppliers returns null gracefully (no Maps grounding)', async () => {
        restore = mockFetch(() => { throw new Error('should not be called'); });

        const service = new CloudAIService('sk-test-key-0123456789');
        const result = await service.findLocalSuppliers('hardware store');

        expect(result).toBeNull();
    });
});

test.describe('GeminiService Nano Banana Integration', () => {

    test('generateProductImage should call correct Nano Banana model and payload', async () => {
        // Mock the GoogleGenAI client and its methods
        const mockGenerateContent = async (params: any) => {
            return {
                candidates: [{
                    content: {
                        parts: [{
                            inlineData: {
                                mimeType: 'image/png',
                                data: 'mock_base64_data'
                            }
                        }]
                    }
                }]
            };
        };

        // We need to intercept the `getClient` method or the `GoogleGenAI` constructor.
        // Since GeminiService instantiates GoogleGenAI internally in `getClient`, 
        // we can spy on the `generateContent` method if we can access the instance.
        // However, `getClient` is private.
        // We can extend GeminiService or use a prototype spy if environmental.

        // Easier approach for this specific test: 
        // We can't easily mock the import '@google/genai' in Playwright without a bundler transform or component testing setup.
        // BUT we can use a "spy" approach if we can inject the client. 
        // The service creates a new client every time.

        // Let's rely on checking the arguments if we can't mock the module easily in this environment. 
        // Actually, since we are in a node environment for the test (Playwright runs in Node),
        // we might be able to mock the module if we use a test runner that supports it.
        // Playwright's component testing or unit testing capabilities can be limited for module mocking compared to Jest/Vitest.

        // Let's blindly trust that I can modify the service to accept a client for testing, OR 
        // I can just inspect the code (which I've done).

        // A better approach for *verification* right now without setting up complex mocks:
        // I will modify `geminiService.ts` to log the model and payload during development/test mode?
        // No, that's messy.

        // Let's try to verify the `visualizer.spec.ts` first, which is an E2E test.
        // The user wants "Unit Tests validating the functionality".
        // I should create a unit test.

        // I'll create a simple test file that imports the service and tries to run it, 
        // but I'll likely hit the issue of not having a real API key or creating real network requests.
        // The previous `visualizer.spec.ts` interacts with the UI. 

        // I will stick to modifying the existing `visualizer.spec.ts` to check the UI text "Nano Banana".
        // I will ALSO create a unit test `tests/unit/geminiService.test.ts`? 
        // The project structure shows `tests/visualizer.spec.ts`.

        // Let's create `tests/geminiService.spec.ts` and attempt to mock.
        // If I can't mock easily, I will rename the model in the service and rely on the UI test to verify the "Nano Banana" text.
        // The payload verification is critical though.

        let capturedParams: any = null;
        const mockGenerateContentSpy = async (params: any) => {
            capturedParams = params;
            return {
                candidates: [{
                    content: {
                        parts: [{
                            inlineData: {
                                mimeType: 'image/png',
                                data: 'mock_base64_data'
                            }
                        }]
                    }
                }]
            };
        };
        const service = new GeminiService('fake-key');
        // We need to override the method on the instance or prototype because `getClient` is private and called internally.
        // TypeScript private is soft, runtime it's accessible.
        // But `getClient` returns a new instance. 
        // @ts-ignore
        service['getClient'] = () => ({
            models: {
                generateContent: mockGenerateContentSpy as any
            }
        } as any);

        await service.generateProductImage('test prompt');

        expect(capturedParams).not.toBeNull();
        expect(capturedParams.model).toBe('gemini-2.5-flash-image'); // Expecting the REVERTED model name

        // Expecting an object { parts } now, NOT an array of contents
        expect(capturedParams.contents.parts).toBeDefined();
        expect(Array.isArray(capturedParams.contents)).toBeFalsy();
        expect(capturedParams.contents.parts[0].text).toContain('test prompt');
    });

    test('parseArchitectResponse should extract single addPart', () => {
        const service = new GeminiService('fake-key');
        const input = `Here is my reasoning. addPart("test-part", "Test Part", "Category", 1);`;
        const result = service.parseArchitectResponse(input);
        
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]).toEqual({ type: 'addPart', partId: 'test-part', name: 'Test Part', category: 'Category', qty: 1 });
        expect(result.reasoning).toBe('Here is my reasoning.');
    });

    test('parseArchitectResponse should extract un-semicoloned addPart calls on multiple lines', () => {
        const service = new GeminiService('fake-key');
        const input = `To integrate your 27" monitor and provide seamless switching between the ProArt PC, the Mac Mini, and the XPS 17 (via eGPU), we need a Triple-Input DisplayPort KVM.

The Architecture Reasoning:
The Standing Surface: I've added a Rubberwood Butcher Block. Wire shelves are unstable for typing; this solid mass provides the "standing desk" feel and matches the wood accents of your ProArt case.
The Switching Logic:
Input 1: Asus ProArt PC (Direct DisplayPort + USB).
Input 2: Mac Mini (Thunderbolt to DisplayPort + USB).
Input 3: Razer Core X eGPU (The XPS 17 plugs into the eGPU, and the eGPU sends DisplayPort + USB to the KVM).
Thunderbolt Routing: We'll use a CalDigit TS4 as a "Pre-Switch" for the Mac. This allows you to have one cable for the Mac that handles its data and video before it hits the KVM.
The Shelf: A 24-inch deep industrial unit is mandatory. Your ProArt PA602 is 23.6" deep; a standard 18" shelf would cause it to overhang dangerously.
addPart("seville-classics-24x36-shelf", "Seville Classics UltraDurable 5-Tier Steel Wire Shelving (24\\" x 36\\")", "Furniture", 1) addPart("hardwood-butcher-block-36x24", "36\\" x 24\\" Solid Rubberwood Workbench Top", "Furniture", 1)`;

        const result = service.parseArchitectResponse(input);
        
        expect(result.toolCalls).toHaveLength(2);
        
        expect(result.toolCalls[0]).toEqual({ 
            type: 'addPart', 
            partId: 'seville-classics-24x36-shelf', 
            name: 'Seville Classics UltraDurable 5-Tier Steel Wire Shelving (24" x 36")', 
            category: 'Furniture', 
            qty: 1 
        });
        
        expect(result.toolCalls[1]).toEqual({ 
            type: 'addPart', 
            partId: 'hardwood-butcher-block-36x24', 
            name: '36" x 24" Solid Rubberwood Workbench Top', 
            category: 'Furniture', 
            qty: 1 
        });
        
        expect(result.reasoning).not.toContain('addPart');
        expect(result.reasoning).toContain('The Shelf: A 24-inch deep industrial unit is mandatory.');
    });

});

test.describe('GeminiService findPartSources URL filtering', () => {

    function buildMockService(groundingChunks: any[], groundingSupports: any[] = []) {
        const service = new GeminiService('fake-key');

        // Build prose text from chunks (the model now returns prose, not JSON)
        const proseText = groundingChunks.map(c => {
            const title = c.web?.title || 'Mock Item';
            return `${title} is available.`;
        }).join(' ');

        const mockClient = {
            models: {
                generateContent: async () => ({                    
                    text: proseText,
                    candidates: [{
                        content: { parts: [{ text: proseText }] },
                        groundingMetadata: {
                            groundingChunks: groundingChunks,
                            groundingSupports: groundingSupports,
                        },
                    }],
                }),
            },
        } as any;
        // @ts-ignore
        service['getClient'] = () => mockClient;
        // @ts-ignore — on-prem routes findPartSources through getSearchClient
        service['getSearchClient'] = () => mockClient;
        return service;
    }

    test('filters out PDF URLs', async () => {
        const service = buildMockService([
            { web: { uri: 'https://newspapers.com/archive/1952-catalog.pdf', title: 'Old Newspaper' } },
            { web: { uri: 'https://retailer.com/product/ragtop-kit', title: 'Ragtop Kit - $299.99' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].url).toContain('retailer.com');
    });

    test('filters out newspaper archive sites', async () => {
        const service = buildMockService([
            { web: { uri: 'https://old-newspaper-archive.com/page/42', title: 'Daily Herald 1965' } },
            { web: { uri: 'https://amazon.com/dp/B09XYZ', title: 'Sliding Ragtop Kit - $349.00' } },
        ]);
        const results = await service.findPartSources('Sliding Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].url).toContain('amazon.com');
    });

    test('filters out Wikipedia and government sites', async () => {
        const service = buildMockService([
            { web: { uri: 'https://en.wikipedia.org/wiki/Ragtop', title: 'Ragtop - Wikipedia' } },
            { web: { uri: 'https://nhtsa.gov/recalls/ragtop', title: 'NHTSA Recall' } },
            { web: { uri: 'https://partsource.com/ragtop-kit', title: 'Ragtop Kit - $199.00' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].url).toContain('partsource.com');
    });

    test('filters out social media and video sites', async () => {
        const service = buildMockService([
            { web: { uri: 'https://youtube.com/watch?v=abc123', title: 'Ragtop Install Video' } },
            { web: { uri: 'https://facebook.com/marketplace/item/123', title: 'Ragtop for sale' } },
            { web: { uri: 'https://pinterest.com/pin/ragtop', title: 'Ragtop Ideas' } },
            { web: { uri: 'https://autoparts.com/sliding-ragtop', title: 'Sliding Ragtop - $399.00' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].url).toContain('autoparts.com');
    });

    test('filters out existing NOISY_DOMAINS (reddit, ebay, forums)', async () => {
        const service = buildMockService([
            { web: { uri: 'https://reddit.com/r/cars/ragtop', title: 'Reddit discussion' } },
            { web: { uri: 'https://ebay.com/itm/123', title: 'eBay listing' } },
            { web: { uri: 'https://forums.hotrod.com/thread/123', title: 'Forum thread' } },
            { web: { uri: 'https://jcwhitney.com/ragtop-kit', title: 'JC Whitney Ragtop - $249.00' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].url).toContain('jcwhitney.com');
    });

    test('keeps legitimate retail and catalog sites', async () => {
        const service = buildMockService([
            { web: { uri: 'https://mcmaster.com/catalog/ragtop', title: 'McMaster-Carr Ragtop - $189.00' } },
            { web: { uri: 'https://grainger.com/product/ragtop', title: 'Grainger Ragtop Kit - $210.00' } },
            { web: { uri: 'https://summitracing.com/parts/ragtop', title: 'Summit Racing Ragtop - $299.00' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(3);
    });

    test('returns "Local Market Research Required" when all results are filtered out', async () => {
        const service = buildMockService([
            { web: { uri: 'https://reddit.com/r/cars/ragtop', title: 'Reddit' } },
            { web: { uri: 'https://en.wikipedia.org/wiki/Ragtop', title: 'Wikipedia' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].title).toBe('Local Market Research Required');
        expect(results![0].url).toBe('');
    });

    test('filters PDFs with query parameters', async () => {
        const service = buildMockService([
            { web: { uri: 'https://example.com/docs/catalog.pdf?page=5', title: 'Product Catalog PDF' } },
            { web: { uri: 'https://shop.com/ragtop', title: 'Shop Ragtop - $150.00' } },
        ]);
        const results = await service.findPartSources('Ragtop Kit');
        expect(results).not.toBeNull();
        expect(results!.length).toBe(1);
        expect(results![0].url).toContain('shop.com');
    });
});
