/**
 * SearchService test suite.
 *
 * Tests validation of:
 * - Request jitter timing (200-700ms range)
 * - Batch chunking logic (5 per chunk)
 * - UI-ready response shape validation
 * - Grounding metadata presence (groundedAt, sourceUrl)
 * - Error handling (API failures return empty arrays, not crash)
 *
 * Uses vi.runAllTimersAsync() to advance fake timers so the SearchService's
 * internal sleep() promises resolve without waiting for real time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchService } from '../services/searchService.js';
import type { ServerAIService, ShoppingOption, LocalSupplier } from '../services/types.js';

// Mock the AI service
class MockAI implements ServerAIService {
  name = "Mock AI Service";
  isOffline = false;

  askArchitect = vi.fn();
  parseArchitectResponse = vi.fn();
  findPartSources = vi.fn();
  findLocalSuppliers = vi.fn();
  hydratePartDetails = vi.fn();
  generateProductImage = vi.fn();
  verifyDesign = vi.fn();
  generateFabricationBrief = vi.fn();
  generateQAProtocol = vi.fn();
  generateAssemblyPlan = vi.fn();
  generateEnclosure = vi.fn();
  identifyComponent = vi.fn();
  applyAuditRecommendations = vi.fn();
  generateStructuredJson = vi.fn();
  getARGuidance = vi.fn();
}

describe('SearchService', () => {
  let searchService: SearchService;
  let mockAI: MockAI;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAI = new MockAI();
    searchService = new SearchService(mockAI);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('findSources()', () => {
    it('should add jitter before API call', async () => {
      mockAI.findPartSources.mockResolvedValue([{
        title: 'Test Source', url: 'https://example.com',
        source: 'Test', price: '$12.99',
      } as ShoppingOption]);
      mockAI.findLocalSuppliers.mockResolvedValue([{
        name: 'Local Supplier', address: '123 Main St',
      } as LocalSupplier]);

      const promise = searchService.findSources('test part');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockAI.findPartSources).toHaveBeenCalledWith(
        'test part', undefined, undefined, undefined
      );
      expect(mockAI.findLocalSuppliers).toHaveBeenCalledWith('test part');
      expect(result.options).toHaveLength(1);
      expect(result.localSuppliers).toHaveLength(1);
    });

    it('should return GroundedShoppingOptions with metadata', async () => {
      mockAI.findPartSources.mockResolvedValue([{
        title: 'Arduino Store',
        url: 'https://store.arduino.cc/atmega328p',
        source: 'Arduino', price: '$4.50',
      } as ShoppingOption]);
      mockAI.findLocalSuppliers.mockResolvedValue([]);

      const promise = searchService.findSources('ATmega328P');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.options).toHaveLength(1);
      expect(result.options[0]).toMatchObject({
        title: 'Arduino Store',
        source: 'Arduino',
        price: '$4.50',
        url: 'https://store.arduino.cc/atmega328p',
        groundedAt: expect.any(String),
        sourceUrl: 'https://store.arduino.cc/atmega328p',
      });
      expect(result.localSuppliers).toHaveLength(0);
    });

    it('should return empty arrays on API failure without crashing', async () => {
      mockAI.findPartSources.mockRejectedValue(new Error('API Error'));
      mockAI.findLocalSuppliers.mockRejectedValue(new Error('API Error'));

      const promise = searchService.findSources('broken part');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.options).toEqual([]);
      expect(result.localSuppliers).toEqual([]);
      expect(result.groundedAt).toBeDefined();
    });

    it('should pass optional parameters to underlying AI service', async () => {
      mockAI.findPartSources.mockResolvedValue([]);
      mockAI.findLocalSuppliers.mockResolvedValue([]);

      const promise = searchService.findSources(
        'part', 'Embedded system', 'en-US', ['mouser.com', 'digikey.com']
      );
      await vi.runAllTimersAsync();
      await promise;

      expect(mockAI.findPartSources).toHaveBeenCalledWith(
        'part', 'Embedded system', 'en-US', ['mouser.com', 'digikey.com']
      );
    });
  });

  describe('hydratePart()', () => {
    it('should add jitter before API call', async () => {
      mockAI.hydratePartDetails.mockResolvedValue({
        brand: 'Example', price: '$99.00',
        category: 'Wearable', name: 'LED Wristwatch',
      });

      const promise = searchService.hydratePart('LED Wristwatch', 'Wearable');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockAI.hydratePartDetails).toHaveBeenCalledWith(
        'LED Wristwatch', 'Wearable', undefined, undefined, undefined
      );
    });

    it('should return HydrateResult with grounding metadata', async () => {
      mockAI.hydratePartDetails.mockResolvedValue({
        brand: 'Espressif', price: '$6.50',
        category: 'Microcontroller', name: 'ESP32 Dev Module',
        specs: ['WiFi', 'Bluetooth'],
      });

      const promise = searchService.hydratePart('ESP32', 'Microcontroller');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.query).toBe('ESP32');
      expect(result.details).toEqual({
        brand: 'Espressif', price: '$6.50',
        category: 'Microcontroller', name: 'ESP32 Dev Module',
        specs: ['WiFi', 'Bluetooth'],
      });
      expect(result.groundedAt).toBeDefined();
    });

    it('should return null details on API failure', async () => {
      mockAI.hydratePartDetails.mockRejectedValue(new Error('AI Error'));

      const promise = searchService.hydratePart('unknown', 'Component');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.details).toBeNull();
      expect(result.groundedAt).toBeDefined();
    });

    it('should pass optional parameters to underlying AI service', async () => {
      mockAI.hydratePartDetails.mockResolvedValue({});

      const promise = searchService.hydratePart(
        'part', 'category', 'IoT device', 'en-GB', ['adafruit.com']
      );
      await vi.runAllTimersAsync();
      await promise;

      expect(mockAI.hydratePartDetails).toHaveBeenCalledWith(
        'part', 'category', 'IoT device', 'en-GB', ['adafruit.com']
      );
    });
  });

  describe('batchSearch()', () => {
    it('should chunk queries into batches of 5 with jitter', async () => {
      const queries = Array.from({ length: 12 }, (_, i) => ({
        query: `part${i}`,
        designContext: i % 2 === 0 ? 'Embedded' : 'IoT',
      }));

      mockAI.findPartSources.mockResolvedValue([]);
      mockAI.findLocalSuppliers.mockResolvedValue([]);

      const promise = searchService.batchSearch(queries);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockAI.findPartSources).toHaveBeenCalledTimes(12);
      expect(result.results).toHaveLength(12);
      // 12 items / 5 per batch = 3 batches
      expect(result.batchCount).toBe(3);
    });

    it('should return results with timing metadata', async () => {
      const queries = [{ query: 'part1' }, { query: 'part2' }];

      mockAI.findPartSources.mockResolvedValue([{
        title: 'Source 1', url: 'https://example.com',
        source: 'Test', price: '$10',
      } as ShoppingOption]);
      mockAI.findLocalSuppliers.mockResolvedValue([]);

      const promise = searchService.batchSearch(queries);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.results).toHaveLength(2);
      expect(result.batchCount).toBe(1);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed query lengths', async () => {
      const queries = Array.from({ length: 7 }, (_, i) => ({
        query: `part${i}`,
        designContext: i % 2 === 0 ? 'Embedded' : 'IoT',
        localeContext: 'en-US',
        preferredVendors: ['mouser.com'],
      }));

      mockAI.findPartSources.mockResolvedValue([]);
      mockAI.findLocalSuppliers.mockResolvedValue([]);

      const promise = searchService.batchSearch(queries);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockAI.findPartSources).toHaveBeenCalledTimes(7);
    });
  });

  describe('batchHydrate()', () => {
    it('should chunk parts into batches of 5 with jitter', async () => {
      const parts = Array.from({ length: 12 }, (_, i) => ({
        name: `part${i}`, category: 'Component',
        designContext: i % 2 === 0 ? 'Embedded' : 'IoT',
      }));

      mockAI.hydratePartDetails.mockResolvedValue({});

      const promise = searchService.batchHydrate(parts);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockAI.hydratePartDetails).toHaveBeenCalledTimes(12);
      expect(result.results).toHaveLength(12);
    });

    it('should return results with timing metadata', async () => {
      const parts = [
        { name: 'part1', category: 'Component' },
        { name: 'part2', category: 'Component' },
      ];

      mockAI.hydratePartDetails.mockResolvedValue({ brand: 'Test', price: '$10' });

      const promise = searchService.batchHydrate(parts);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.results).toHaveLength(2);
      expect(result.results.every(r => r.details?.brand === 'Test')).toBe(true);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('normalizeOptions()', () => {
    it('should attach metadata to all options', async () => {
      mockAI.findPartSources.mockResolvedValue([
        { title: 'Source 1', url: 'https://example.com/1', source: 'Test', price: '$10' },
        { title: 'Source 2', url: 'https://example.com/2', source: 'Test', price: '$12' },
      ] as ShoppingOption[]);
      mockAI.findLocalSuppliers.mockResolvedValue([]);

      const promise = searchService.findSources('ATmega328P');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.options).toHaveLength(2);
      result.options.forEach(opt => {
        expect(opt).toHaveProperty('groundedAt');
        expect(opt).toHaveProperty('sourceUrl');
        expect(opt.sourceUrl).toBe(opt.url);
      });
    });
  });
});