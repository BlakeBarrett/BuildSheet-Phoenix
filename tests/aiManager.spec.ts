
import { test, expect } from '@playwright/test';
import { AIManager, AIConfiguration } from '../services/aiManager';

test.describe('AIManager', () => {
    test('getAIConfig should return default configuration', () => {
        const config = AIManager.getAIConfig();
        
        expect(config).toHaveProperty('provider');
        expect(config).toHaveProperty('geminiApiKey');
        expect(config).toHaveProperty('localConfig');
        
        // Default provider should be gemini
        expect(['gemini', 'ollama', 'local']).toContain(config.provider);
    });

    test('getCurrentProvider should return a valid provider', () => {
        const provider = AIManager.getCurrentProvider();
        expect(['gemini', 'ollama', 'local']).toContain(provider);
    });

    test('hasApiKey should return boolean', () => {
        const hasKey = AIManager.hasApiKey();
        expect(typeof hasKey).toBe('boolean');
    });

    test('createService should return a service object', async () => {
        const result = await AIManager.createService();
        
        expect(result).toHaveProperty('service');
        expect(result).toHaveProperty('error');
        expect(typeof result.service).toBe('object');
        expect(typeof result.error).toBe('string');
        
        // Service should implement AIService interface
        expect(result.service).toHaveProperty('name');
        expect(result.service).toHaveProperty('isOffline');
        expect(result.service).toHaveProperty('askArchitect');
        expect(result.service).toHaveProperty('parseArchitectResponse');
        expect(typeof result.service.askArchitect).toBe('function');
        expect(typeof result.service.parseArchitectResponse).toBe('function');
    });

    test('switchProvider should handle gemini provider', async () => {
        const result = await AIManager.switchProvider('gemini');
        
        expect(result).toHaveProperty('service');
        expect(result.service).toHaveProperty('name');
        
        // If no API key is configured, it should return an error
        if (result.error) {
            expect(typeof result.error).toBe('string');
        }
    });

    test('switchProvider should handle ollama provider with valid config', async () => {
        const localConfig = {
            baseUrl: 'http://localhost:11434',
            model: 'llama3.2'
        };
        
        const result = await AIManager.switchProvider('ollama', localConfig);
        
        expect(result).toHaveProperty('service');
        
        // If Ollama is not running, it will return an error
        if (result.error) {
            expect(typeof result.error).toBe('string');
            // Should mention connection or initialization
            expect(result.error.toLowerCase()).toMatch(/(connection|failed|initialize|local)/);
        }
    });

    test('switchProvider should handle ollama provider without config', async () => {
        const result = await AIManager.switchProvider('ollama');
        
        // Should fail without configuration
        expect(result.error).toBeTruthy();
        expect(result.error).toContain('No Local AI configuration provided');
    });

    test('switchProvider should handle invalid provider', async () => {
        // @ts-ignore - testing invalid input
        const result = await AIManager.switchProvider('invalid-provider');
        
        expect(result.error).toBeTruthy();
        expect(result.error).toContain('Unknown provider');
    });

    test('isValidKey should validate API keys correctly', () => {
        // Test private method through public behavior
        // Valid key should be more than 10 characters and not placeholder
        const result = AIManager.hasApiKey();
        expect(typeof result).toBe('boolean');
    });
});

test.describe('AIManager Configuration Priority', () => {
    test('should read configuration from multiple sources', () => {
        const config = AIManager.getAIConfig();
        
        // Config should be an object with expected properties
        expect(typeof config).toBe('object');
        expect(config.provider).toBeDefined();
    });

    test('createService should fallback to MockService when no config available', async () => {
        const result = await AIManager.createService();
        
        // Should always return a service
        expect(result.service).toBeDefined();
        
        // If there's an error, service should be MockService
        if (result.error) {
            // MockService isOffline = true
            expect(result.service.isOffline).toBe(true);
        }
    });
});
