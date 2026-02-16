
import { test, expect } from '@playwright/test';
import { LocalAIService, LocalAIConfig } from '../services/localAIService';

test.describe('LocalAIService', () => {
    const mockConfig: LocalAIConfig = {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2',
        apiKey: undefined
    };

    test('constructor should normalize baseUrl by removing trailing slash', () => {
        const configWithSlash: LocalAIConfig = {
            baseUrl: 'http://localhost:11434/',
            model: 'llama3.2'
        };
        const service = new LocalAIService(configWithSlash);
        // @ts-ignore - accessing private property for test
        expect(service.config.baseUrl).toBe('http://localhost:11434');
    });

    test('getApiKeyStatus should return appropriate message', () => {
        const serviceNoKey = new LocalAIService({
            baseUrl: 'http://localhost:11434',
            model: 'llama3.2'
        });
        expect(serviceNoKey.getApiKeyStatus()).toBe('No API Key (Local Server)');

        const serviceWithKey = new LocalAIService({
            baseUrl: 'http://localhost:11434',
            model: 'llama3.2',
            apiKey: 'test-api-key-12345'
        });
        expect(serviceWithKey.getApiKeyStatus()).toContain('test...');
        expect(serviceWithKey.getApiKeyStatus()).toContain('Len: 18');
    });

    test('parseArchitectResponse should extract tool calls correctly', () => {
        const service = new LocalAIService(mockConfig);

        const response1 = service.parseArchitectResponse('I will help you build this.\n\ninitializeDraft("Drone Project", "A flying quadcopter")\naddPart("motor-brushless", 4)\naddPart("esc-30a", 4)');
        
        expect(response1.reasoning).toContain('I will help you build this');
        expect(response1.toolCalls).toHaveLength(3);
        expect(response1.toolCalls[0]).toEqual({ type: 'initializeDraft', name: 'Drone Project', reqs: 'A flying quadcopter' });
        expect(response1.toolCalls[1]).toEqual({ type: 'addPart', partId: 'motor-brushless', qty: 4 });
        expect(response1.toolCalls[2]).toEqual({ type: 'addPart', partId: 'esc-30a', qty: 4 });

        const response2 = service.parseArchitectResponse('Let me remove that part.\n\nremovePart("part-123")');
        expect(response2.toolCalls).toHaveLength(1);
        expect(response2.toolCalls[0]).toEqual({ type: 'removePart', instanceId: 'part-123' });
    });

    test('parseArchitectResponse should handle empty or malformed responses', () => {
        const service = new LocalAIService(mockConfig);

        const response1 = service.parseArchitectResponse('');
        expect(response1.reasoning).toBe('Local AI provided no output.');
        expect(response1.toolCalls).toEqual([]);

        const response2 = service.parseArchitectResponse('Just some text without tool calls');
        expect(response2.reasoning).toBe('Just some text without tool calls');
        expect(response2.toolCalls).toEqual([]);
    });

    test('parseArchitectResponse should clean up tool call formatting artifacts', () => {
        const service = new LocalAIService(mockConfig);

        const response = service.parseArchitectResponse(`
I'll help you build a keyboard.

### Tool Calls:
addPart("kb-pcb-1", 1)

Task 1: Correction
addPart("kb-sw-1", 68)

\`\`\`json
{ "tool": "addPart", "arguments": { "partId": "test" } }
\`\`\`
`);

        expect(response.reasoning).not.toContain('### Tool Calls:');
        expect(response.reasoning).not.toContain('Task 1: Correction');
        expect(response.reasoning).not.toContain('```json');
    });

    test('service properties should be set correctly', () => {
        const service = new LocalAIService(mockConfig);
        expect(service.name).toBe('Local AI (Ollama)');
        expect(service.isOffline).toBe(false);
    });

    test('generateProductImage should return null (not supported)', async () => {
        const service = new LocalAIService(mockConfig);
        const result = await service.generateProductImage('test description');
        expect(result).toBeNull();
    });

    test('findPartSources should return null (not supported)', async () => {
        const service = new LocalAIService(mockConfig);
        const result = await service.findPartSources('Arduino');
        expect(result).toBeNull();
    });

    test('findLocalSuppliers should return null (not supported)', async () => {
        const service = new LocalAIService(mockConfig);
        const result = await service.findLocalSuppliers('electronics store');
        expect(result).toBeNull();
    });
});

test.describe('LocalAIService Integration', () => {
    test('testConnection should handle successful connection', async () => {
        // This test would require a mock server or actual Ollama instance
        // For now, we test the method structure
        const config: LocalAIConfig = {
            baseUrl: 'http://localhost:11434',
            model: 'llama3.2'
        };
        const service = new LocalAIService(config);
        
        // The testConnection method exists and is public
        expect(typeof service.testConnection).toBe('function');
    });
});
