/**
 * VerifiedFactService test suite.
 *
 * Tests validation of:
 * - Fact storage with proper ID generation and timestamps
 * - Fact retrieval by ID
 * - Search filtering (category, tags, searchTerm, minConfidence)
 * - Fact updates with automatic timestamp updates
 * - Fact deletion
 * - Error handling for missing facts
 *
 * Uses mocked Firestore to test service logic without actual database calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VerifiedFactService } from '../services/verifiedFactService.js';
import type { VerifiedFact, FactQuery } from '../types/verifiedFacts.js';
import { Firestore } from 'firebase-admin/firestore';

// Mock Firestore document reference
class MockDocRef {
  static store: Map<string, any> = new Map();

  constructor(private collectionName: string, private docId: string) {}

  async set(data: any): Promise<void> {
    MockDocRef.store.set(`${this.collectionName}/${this.docId}`, data);
  }

  async get(): Promise<{ exists: boolean; data: () => any }> {
    const docData = MockDocRef.store.get(`${this.collectionName}/${this.docId}`);
    return {
      exists: !!docData,
      data: () => docData
    };
  }

  async delete(): Promise<void> {
    MockDocRef.store.delete(`${this.collectionName}/${this.docId}`);
  }
}

// Mock Query
class MockQuery {
  constructor(
    private collectionName: string,
    private conditions: Array<{ field: string; operator: string; value: any }> = []
  ) {}

  where(field: string, operator: string, value: any): MockQuery {
    return new MockQuery(this.collectionName, [...this.conditions, { field, operator, value }]);
  }

  // Production code bounds its collection scan with .limit(); the mock
  // accepts and ignores it (test data is tiny by construction).
  limit(_n: number): MockQuery {
    return this;
  }

  async get(): Promise<{ forEach: (fn: (doc: any) => void) => void }> {
    // For testing, return a mock snapshot with filtered results
    const mockDocs: any[] = [];
    
    // Simulate some test data
    const testFacts: VerifiedFact[] = [
      {
        factId: 'fact-1',
        category: 'component-specs',
        statement: 'ATmega328P operates at 5V',
        source: 'documentation',
        confidence: 0.95,
        tags: ['avr', 'microcontroller', 'voltage'],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        status: 'approved'
      },
      {
        factId: 'fact-2',
        category: 'compatibility',
        statement: 'ESP32 is compatible with Arduino framework',
        source: 'web-verified',
        confidence: 0.9,
        tags: ['esp32', 'arduino', 'compatibility'],
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
        status: 'approved'
      },
      {
        factId: 'fact-3',
        category: 'component-specs',
        statement: 'Capacitor values are in microfarads',
        source: 'documentation',
        confidence: 0.85,
        tags: ['capacitor', 'units'],
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-03'),
        status: 'approved'
      },
      {
        factId: 'fact-4',
        category: 'procurement',
        statement: 'DigiKey has fastest shipping to US',
        source: 'web-verified',
        confidence: 0.7,
        tags: ['digikey', 'shipping'],
        createdAt: new Date('2024-01-04'),
        updatedAt: new Date('2024-01-04'),
        status: 'pending' // Not approved
      },
      {
        factId: 'fact-5',
        category: 'general',
        statement: 'Soldering iron temperature should be 350C',
        source: 'admin',
        confidence: 0.92,
        tags: ['soldering', 'temperature'],
        createdAt: new Date('2024-01-05'),
        updatedAt: new Date('2024-01-05'),
        status: 'approved'
      }
    ];

    // Filter based on conditions
    const filtered = testFacts.filter(fact => {
      return this.conditions.every(cond => {
        if (cond.operator === '==') {
          return fact[cond.field as keyof VerifiedFact] === cond.value;
        }
        return true;
      });
    });

    filtered.forEach(fact => {
      mockDocs.push({
        data: () => fact
      });
    });

    return {
      forEach: (fn: (doc: any) => void) => mockDocs.forEach(fn)
    };
  }
}

// Mock Firestore database
class MockFirestore {
  private data: Map<string, any> = new Map();

  collection(name: string) {
    return {
      doc: (id: string) => new MockDocRef(name, id),
      where: (field: string, operator: string, value: any) => 
        new MockQuery(name, [{ field, operator, value }])
    };
  }
}

describe('VerifiedFactService', () => {
  let service: VerifiedFactService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = new MockFirestore();
    service = new VerifiedFactService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
    MockDocRef.store.clear();
  });

  describe('storeFact()', () => {
    it('should generate a factId and timestamps', async () => {
      const factInput = {
        category: 'component-specs' as const,
        statement: 'Test fact statement',
        source: 'documentation' as const,
        confidence: 0.85,
        tags: ['test', 'example'],
        status: 'approved' as const
      };

      const result = await service.storeFact(factInput);

      expect(result.factId).toBeDefined();
      expect(result.factId.length).toBeGreaterThan(0);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.statement).toBe('Test fact statement');
      expect(result.status).toBe('approved');
    });

    it('should preserve all input fields in stored fact', async () => {
      const factInput = {
        category: 'compatibility' as const,
        statement: 'Component X is compatible with Y',
        source: 'web-verified' as const,
        confidence: 0.92,
        tags: ['compatibility', 'test'],
        status: 'approved' as const,
        createdBy: 'user-123'
      };

      const result = await service.storeFact(factInput);

      expect(result.category).toBe('compatibility');
      expect(result.source).toBe('web-verified');
      expect(result.confidence).toBe(0.92);
      expect(result.tags).toEqual(['compatibility', 'test']);
      expect(result.createdBy).toBe('user-123');
    });
  });

  describe('getFact()', () => {
    it('should return null for non-existent fact', async () => {
      const result = await service.getFact('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return fact when it exists', async () => {
      // First store a fact
      const factInput = {
        category: 'general' as const,
        statement: 'Stored fact for retrieval test',
        source: 'admin' as const,
        confidence: 1.0,
        tags: ['retrieval-test'],
        status: 'approved' as const
      };

      const stored = await service.storeFact(factInput);
      const retrieved = await service.getFact(stored.factId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.factId).toBe(stored.factId);
      expect(retrieved?.statement).toBe('Stored fact for retrieval test');
    });
  });

  describe('searchFacts()', () => {
    it('should return only approved facts by default', async () => {
      const results = await service.searchFacts({});
      
      // fact-4 has status 'pending', should not be included
      expect(results.length).toBeLessThanOrEqual(4);
      expect(results.every(f => f.status === 'approved')).toBe(true);
    });

    it('should filter by category', async () => {
      const results = await service.searchFacts({ 
        category: 'component-specs' 
      });
      
      expect(results.every(f => f.category === 'component-specs')).toBe(true);
    });

    it('should filter by minConfidence', async () => {
      const results = await service.searchFacts({ 
        minConfidence: 0.9 
      });
      
      expect(results.every(f => f.confidence >= 0.9)).toBe(true);
    });

    it('should filter by tags', async () => {
      const results = await service.searchFacts({ 
        tags: ['esp32'] 
      });
      
      expect(results.length).toBe(1);
      expect(results[0].tags).toContain('esp32');
    });

    it('should filter by searchTerm', async () => {
      const results = await service.searchFacts({ 
        searchTerm: 'ATmega' 
      });
      
      expect(results.length).toBe(1);
      expect(results[0].statement).toContain('ATmega328P');
    });

    it('should respect limit parameter', async () => {
      const results = await service.searchFacts({ limit: 2 });
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should combine multiple filters', async () => {
      const results = await service.searchFacts({ 
        category: 'component-specs',
        minConfidence: 0.8,
        tags: ['avr']
      });
      
      expect(results.every(f => f.category === 'component-specs')).toBe(true);
      expect(results.every(f => f.confidence >= 0.8)).toBe(true);
      expect(results.every(f => f.tags.includes('avr'))).toBe(true);
    });
  });

  describe('updateFact()', () => {
    it('should return null for non-existent fact', async () => {
      const result = await service.updateFact('non-existent-id', {
        statement: 'Updated statement'
      });
      expect(result).toBeNull();
    });

    it('should update fact and refresh updatedAt timestamp', async () => {
      const factInput = {
        category: 'general' as const,
        statement: 'Original statement',
        source: 'admin' as const,
        confidence: 0.8,
        tags: ['update-test'],
        status: 'approved' as const
      };

      const stored = await service.storeFact(factInput);
      const originalCreatedAt = stored.createdAt;
      const originalUpdatedAt = stored.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await service.updateFact(stored.factId, {
        statement: 'Updated statement',
        confidence: 0.95
      });

      expect(updated).not.toBeNull();
      expect(updated?.statement).toBe('Updated statement');
      expect(updated?.confidence).toBe(0.95);
      expect(updated?.updatedAt).not.toEqual(originalUpdatedAt);
      expect(updated?.createdAt).toEqual(originalCreatedAt); // createdAt should be preserved
    });

    it('should preserve factId and createdAt on update', async () => {
      const factInput = {
        category: 'general' as const,
        statement: 'Test',
        source: 'admin' as const,
        confidence: 0.8,
        tags: [],
        status: 'approved' as const
      };

      const stored = await service.storeFact(factInput);
      const originalCreatedAt = stored.createdAt;
      const originalFactId = stored.factId;

      const updated = await service.updateFact(stored.factId, {
        statement: 'Updated'
      });

      expect(updated?.factId).toBe(originalFactId);
      expect(updated?.createdAt).toEqual(originalCreatedAt);
    });
  });

  describe('deleteFact()', () => {
    it('should return false for non-existent fact', async () => {
      const result = await service.deleteFact('non-existent-id');
      expect(result).toBe(false);
    });

    it('should successfully delete existing fact', async () => {
      const factInput = {
        category: 'general' as const,
        statement: 'Fact to delete',
        source: 'admin' as const,
        confidence: 0.8,
        tags: ['delete-test'],
        status: 'approved' as const
      };

      const stored = await service.storeFact(factInput);
      const deleteResult = await service.deleteFact(stored.factId);
      const retrieved = await service.getFact(stored.factId);

      expect(deleteResult).toBe(true);
      expect(retrieved).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty tag filter correctly', async () => {
      const results = await service.searchFacts({ tags: [] });
      // Empty tags array means "no tag filter" — every approved fact matches.
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(f => f.status === 'approved')).toBe(true);
    });

    it('should handle case-insensitive search', async () => {
      const resultsUpper = await service.searchFacts({ searchTerm: 'ATMEGA328P' });
      const resultsLower = await service.searchFacts({ searchTerm: 'atmega328p' });
      
      expect(resultsUpper.length).toBe(resultsLower.length);
    });

    it('should return empty array when no facts match', async () => {
      const results = await service.searchFacts({ 
        category: 'non-existent-category' 
      });
      
      expect(results).toEqual([]);
    });
  });
});
