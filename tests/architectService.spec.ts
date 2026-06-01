
import { test, expect } from '@playwright/test';
import { ArchitectService } from '../services/architectService';
import { CloudAIService } from '../services/cloudAiService';
import http from 'http';
import * as net from 'net';

// ---------------------------------------------------------------------------
// CloudAIService — on-prem provider path
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

test.describe('CloudAIService — on-prem path', () => {

    let restore: () => void;

    test.beforeEach(() => {
        // Support both Node and Browser contexts
        if (typeof window !== 'undefined') {
            (window as any)._env_ = (window as any)._env_ || {};
            (window as any)._env_.AI_PROVIDER = 'on-prem';
            (window as any)._env_.AI_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';
        }
        process.env.AI_PROVIDER = 'on-prem';
        process.env.AI_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';
    });

    test.afterEach(() => {
        if (typeof window !== 'undefined' && (window as any)._env_) {
            delete (window as any)._env_.AI_PROVIDER;
            delete (window as any)._env_.AI_BASE_URL;
        }
        delete process.env.AI_PROVIDER;
        delete process.env.AI_BASE_URL;
        if (restore) restore();
    });

    test('askArchitect POSTs to internal /api/v1/ai/chat', async () => {
        const calls: FetchArgs[] = [];
        restore = mockFetch((url, init) => {
            calls.push({ url, init });
            return chatCompletionsResponse('addPart("led-5mm", "5mm Red LED", "Component", 5)');
        });

        const service = new CloudAIService('sk-test-key-0123456789');
        const result = await service.askArchitect('Build me an LED circuit', []);

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/api/v1/ai/chat');
        expect(calls[0].init.headers).toMatchObject({
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

    test('askArchitect converts cloud history roles (model → assistant)', async () => {
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
        expect(roles).not.toContain('model');   // cloud role must be converted
        expect(roles).toContain('assistant');
    });

    test('generateStructuredJson sends request to /api/v1/ai/generate-structured', async () => {
        let capturedUrl: string = '';
        restore = mockFetch((url, init) => {
            capturedUrl = url;
            return chatCompletionsResponse('{"price": 12.99, "brand": "Acme"}');
        });

        const service = new CloudAIService('sk-test-key-0123456789');
        await service.generateStructuredJson('price for a 5mm LED', {});

        expect(capturedUrl).toContain('/api/v1/ai/generate-structured');
    });
});


    test('parseArchitectResponse should extract single addPart', () => {
        const service = new ArchitectService('fake-key');
        const input = `Here is my reasoning. addPart("test-part", "Test Part", "Category", 1);`;
        const result = service.parseArchitectResponse(input);
        
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]).toEqual({ type: 'addPart', partId: 'test-part', name: 'Test Part', category: 'Category', qty: 1 });
        expect(result.reasoning).toBe('Here is my reasoning.');
    });

    test('parseArchitectResponse should extract un-semicoloned addPart calls on multiple lines', () => {
        const service = new ArchitectService('fake-key');
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
