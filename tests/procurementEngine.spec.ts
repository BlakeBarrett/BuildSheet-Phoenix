import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VerifiedProcurementEngine, GeminiVerificationClient } from '../services/procurementEngine';
import { ProcurementStatus, GEOPOL_RISK_MAP, DEFAULT_CATEGORY_BASELINES } from '../services/procurementTypes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Helpers: mock data factories
// ---------------------------------------------------------------------------

function mockGeminiClient(overrides?: Partial<GeminiVerificationClient>): GeminiVerificationClient {
  return {
    generateStructuredJson: async () => ({
      price: 89.99,
      stock_status: 'in_stock',
      shipping_location: 'United States',
      last_updated_date: '2026-04-01',
    }),
    ...overrides,
  };
}

function makeSearxngResponse(count: number) {
  return {
    results: Array.from({ length: count }, (_, i) => ({
      url: `https://vendor${i}.example.com/product`,
      title: `DDR5 RAM Kit ${i}`,
      engine: 'google',
    })),
  };
}

function makeFirecrawlResponse(markdown: string) {
  return { data: { markdown } };
}

const PRODUCT_MARKDOWN = `
# Corsair Vengeance DDR5 32GB Kit
**Price:** $89.99
**Availability:** In Stock
Ships from United States
Last updated: 2026-04-01
`;

const OOS_MARKDOWN = `
# Corsair Vengeance DDR5 32GB Kit
**Price:** $89.99
**Availability:** Out of Stock — Sold Out
Ships from United States
`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('VerifiedProcurementEngine', () => {

  // =========================================================================
  // REGEX FALLBACK EXTRACTION
  // =========================================================================

  test.describe('regexFallbackExtract', () => {

    test('extracts price from dollar sign notation', () => {
      const engine = new VerifiedProcurementEngine(
        { verification_backend: 'local' },
        null
      );
      // Access private method via bracket notation
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://example.com/product',
        markdown: 'Great DDR5 kit for $89.99 — buy now!',
        extractedAt: new Date(),
      });
      expect(result.price).toBe(89.99);
      expect(result.source_name).toBe('example.com');
      expect(result.confidence).toBe(0.35);
    });

    test('detects in_stock status', () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://shop.example.com/item',
        markdown: 'Price: $49.99\nThis item is In Stock and ready to ship.',
        extractedAt: new Date(),
      });
      expect(result.stock_status).toBe('in_stock');
      expect(result.price).toBe(49.99);
    });

    test('detects out_of_stock status', () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://shop.example.com/item',
        markdown: 'Sorry, this product is currently Out of Stock.',
        extractedAt: new Date(),
      });
      expect(result.stock_status).toBe('out_of_stock');
    });

    test('detects limited stock status', () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://shop.example.com/item',
        markdown: 'Hurry — only a few left! $129.99',
        extractedAt: new Date(),
      });
      expect(result.stock_status).toBe('limited');
    });

    test('detects backorder status', () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://shop.example.com/item',
        markdown: 'This item is on backorder. Expected in 2 weeks. $199.00',
        extractedAt: new Date(),
      });
      expect(result.stock_status).toBe('backorder');
    });

    test('returns unknown stock when no keywords match', () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://shop.example.com/item',
        markdown: 'Some random product description with $10.00',
        extractedAt: new Date(),
      });
      expect(result.stock_status).toBe('unknown');
    });

    test('returns null price when no dollar amount found', () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);
      // @ts-ignore
      const result = engine.regexFallbackExtract({
        url: 'https://shop.example.com/item',
        markdown: 'Contact us for pricing. Available now.',
        extractedAt: new Date(),
      });
      expect(result.price).toBeNull();
      expect(result.stock_status).toBe('in_stock'); // 'Available' keyword
    });
  });

  // =========================================================================
  // LOGISTICS RISK EVALUATION
  // =========================================================================

  test.describe('evaluateLogisticsRisk', () => {

    test('flags Hormuz Strait zone for Iran shipping', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const risk = engine.evaluateLogisticsRisk('Bandar Abbas, Iran');
      expect(risk).not.toBeNull();
      expect(risk!.zone).toBe('Hormuz Strait');
      expect(risk!.delay_estimate_days).toBe(21);
    });

    test('flags Red Sea zone for Yemen shipping', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const risk = engine.evaluateLogisticsRisk('Aden, Yemen');
      expect(risk).not.toBeNull();
      expect(risk!.zone).toBe('Red Sea');
      expect(risk!.delay_estimate_days).toBe(21);
    });

    test('flags Taiwan Strait zone', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const risk = engine.evaluateLogisticsRisk('Kaohsiung, Taiwan Strait region');
      expect(risk).not.toBeNull();
      expect(risk!.zone).toBe('Taiwan Strait');
      expect(risk!.delay_estimate_days).toBe(14);
    });

    test('returns null for safe shipping locations', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const risk = engine.evaluateLogisticsRisk('Los Angeles, United States');
      expect(risk).toBeNull();
    });

    test('returns null for null shipping location', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const risk = engine.evaluateLogisticsRisk(null);
      expect(risk).toBeNull();
    });

    test('matches case-insensitively', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const risk = engine.evaluateLogisticsRisk('STRAIT OF HORMUZ');
      expect(risk).not.toBeNull();
      expect(risk!.zone).toBe('Hormuz Strait');
    });
  });

  // =========================================================================
  // PARSE VERIFIED DATA
  // =========================================================================

  test.describe('parseVerifiedData', () => {

    test('parses valid structured response', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const result = engine.parseVerifiedData(
        { price: 129.99, stock_status: 'in_stock', shipping_location: 'Germany', last_updated_date: '2026-03-30' },
        { url: 'https://shop.de/item', markdown: '', extractedAt: new Date() }
      );
      expect(result.price).toBe(129.99);
      expect(result.stock_status).toBe('in_stock');
      expect(result.shipping_location).toBe('Germany');
      expect(result.source_name).toBe('shop.de');
      expect(result.confidence).toBe(0.85);
    });

    test('normalizes invalid stock_status to unknown', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const result = engine.parseVerifiedData(
        { price: 50, stock_status: 'maybe', shipping_location: null, last_updated_date: null },
        { url: 'https://shop.com/x', markdown: '', extractedAt: new Date() }
      );
      expect(result.stock_status).toBe('unknown');
    });

    test('handles non-numeric price gracefully', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const result = engine.parseVerifiedData(
        { price: 'N/A', stock_status: 'in_stock', shipping_location: null, last_updated_date: null },
        { url: 'https://shop.com/x', markdown: '', extractedAt: new Date() }
      );
      expect(result.price).toBeNull();
    });
  });

  // =========================================================================
  // PICK BEST SOURCE
  // =========================================================================

  test.describe('pickBestSource', () => {

    test('picks highest confidence then lowest price', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      const sources = [
        { price: 100, confidence: 0.85, stock_status: 'in_stock' as const, shipping_location: null, last_updated_date: null, source_url: 'a', source_name: 'a' },
        { price: 80, confidence: 0.85, stock_status: 'in_stock' as const, shipping_location: null, last_updated_date: null, source_url: 'b', source_name: 'b' },
        { price: 70, confidence: 0.35, stock_status: 'in_stock' as const, shipping_location: null, last_updated_date: null, source_url: 'c', source_name: 'c' },
      ];
      // @ts-ignore
      const best = engine.pickBestSource(sources);
      expect(best!.price).toBe(80);
      expect(best!.source_name).toBe('b');
    });

    test('returns first source when none have prices', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      const sources = [
        { price: null, confidence: 0.85, stock_status: 'unknown' as const, shipping_location: null, last_updated_date: null, source_url: 'a', source_name: 'first' },
        { price: null, confidence: 0.35, stock_status: 'unknown' as const, shipping_location: null, last_updated_date: null, source_url: 'b', source_name: 'second' },
      ];
      // @ts-ignore
      const best = engine.pickBestSource(sources);
      expect(best!.source_name).toBe('first');
    });

    test('returns null for empty array', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const best = engine.pickBestSource([]);
      expect(best).toBeNull();
    });
  });

  // =========================================================================
  // SHOPPING OPTION CONVERSION
  // =========================================================================

  test.describe('toShoppingOption', () => {

    test('converts verified data to legacy ShoppingOption format', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const opt = engine.toShoppingOption({
        price: 89.99,
        stock_status: 'in_stock',
        shipping_location: 'US',
        last_updated_date: null,
        source_url: 'https://newegg.com/item',
        source_name: 'newegg.com',
        confidence: 0.85,
      });
      expect(opt.title).toBe('newegg.com [in stock]');
      expect(opt.url).toBe('https://newegg.com/item');
      expect(opt.price).toBe('$89.99');
      expect(opt.isEstimated).toBe(false);
    });

    test('marks low-confidence results as estimated', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const opt = engine.toShoppingOption({
        price: 20,
        stock_status: 'unknown',
        shipping_location: null,
        last_updated_date: null,
        source_url: 'https://x.com/item',
        source_name: 'x.com',
        confidence: 0.3,
      });
      expect(opt.isEstimated).toBe(true);
    });

    test('omits price string when price is null', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const opt = engine.toShoppingOption({
        price: null,
        stock_status: 'in_stock',
        shipping_location: null,
        last_updated_date: null,
        source_url: 'https://x.com/item',
        source_name: 'x.com',
        confidence: 0.85,
      });
      expect(opt.price).toBeUndefined();
    });
  });

  // =========================================================================
  // PRICE ANOMALY DETECTOR
  // =========================================================================

  test.describe('priceAnomalyDetector', () => {

    test('flags price >50% below DDR5 RAM baseline as anomaly', async () => {
      const engine = new VerifiedProcurementEngine({
        anomaly_threshold_pct: 50,
        // Prevent actual SearXNG call for 4th source
        searxng_base_url: 'http://0.0.0.0:1',
      }, null);

      const result = await engine.priceAnomalyDetector(
        30, // $30 vs $85 baseline (DDR5 RAM) → ~65% below
        'DDR5 RAM',
        []
      );

      expect(result.detected).toBe(true);
      expect(result.found_price).toBe(30);
      expect(result.rolling_avg_7d).toBe(DEFAULT_CATEGORY_BASELINES['DDR5 RAM']);
      expect(result.deviation_pct).toBeGreaterThan(50);
      expect(result.category).toBe('DDR5 RAM');
    });

    test('does not flag price within normal range', async () => {
      const engine = new VerifiedProcurementEngine({ anomaly_threshold_pct: 50 }, null);

      const result = await engine.priceAnomalyDetector(
        75, // $75 vs $85 baseline → ~12% below
        'DDR5 RAM',
        []
      );

      expect(result.detected).toBe(false);
      expect(result.deviation_pct).toBeLessThan(50);
    });

    test('returns no anomaly when category has no baseline', async () => {
      const engine = new VerifiedProcurementEngine({ anomaly_threshold_pct: 50 }, null);

      const result = await engine.priceAnomalyDetector(
        5,
        'Exotic Quantum Coprocessor', // no baseline
        []
      );

      expect(result.detected).toBe(false);
      expect(result.rolling_avg_7d).toBe(0);
    });
  });

  // =========================================================================
  // GEMINI VERIFICATION PATH
  // =========================================================================

  test.describe('stageVerification with Gemini backend', () => {

    test('uses Gemini client when backend is gemini and client is provided', async () => {
      let callCount = 0;
      const client = mockGeminiClient({
        generateStructuredJson: async () => {
          callCount++;
          return { price: 99.99, stock_status: 'in_stock', shipping_location: 'USA', last_updated_date: '2026-04-01' };
        },
      });

      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      const pages = [
        { url: 'https://store.com/p1', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
        { url: 'https://store.com/p2', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
      ];

      // @ts-ignore
      const results = await engine.stageVerification(pages);

      expect(callCount).toBe(2);
      expect(results).toHaveLength(2);
      expect(results[0].price).toBe(99.99);
      expect(results[0].stock_status).toBe('in_stock');
      expect(results[0].confidence).toBe(0.85);
    });

    test('falls back to regex when Gemini client throws', async () => {
      const client = mockGeminiClient({
        generateStructuredJson: async () => { throw new Error('API quota exceeded'); },
      });

      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);
      const pages = [
        { url: 'https://store.com/p', markdown: 'Product X — $45.00 — In Stock', extractedAt: new Date() },
      ];

      // @ts-ignore
      const results = await engine.stageVerification(pages);

      expect(results).toHaveLength(1);
      expect(results[0].price).toBe(45.00);
      expect(results[0].confidence).toBe(0.35); // regex fallback confidence
    });

    test('falls back to regex when no backend is available', async () => {
      const engine = new VerifiedProcurementEngine({ verification_backend: 'local' }, null);

      const pages = [
        { url: 'https://store.com/p', markdown: 'Price: $199.99 - Available', extractedAt: new Date() },
      ];

      // @ts-ignore
      const results = await engine.stageVerification(pages);

      expect(results).toHaveLength(1);
      expect(results[0].price).toBe(199.99);
      expect(results[0].stock_status).toBe('in_stock');
      expect(results[0].confidence).toBe(0.35);
    });
  });

  // =========================================================================
  // FULL PIPELINE — procure()
  // =========================================================================

  test.describe('procure() full pipeline', () => {

    test('returns ERROR status when discovery returns nothing', async () => {
      const engine = new VerifiedProcurementEngine({
        searxng_base_url: 'http://0.0.0.0:1', // unreachable
      }, mockGeminiClient());

      const result = await engine.procure('DDR5 RAM', 'DDR5 RAM');

      expect(result.status).toBe(ProcurementStatus.ERROR);
      expect(result.verified_sources_count).toBe(0);
      expect(result.shopping_options).toHaveLength(1);
      expect(result.shopping_options[0].title).toContain('Procurement failed');
    });

    test('returns OUT_OF_STOCK with ALL_SOURCES_OOS flag when every source is OOS', async () => {
      const client = mockGeminiClient({
        generateStructuredJson: async () => ({
          price: 89.99,
          stock_status: 'out_of_stock',
          shipping_location: 'US',
          last_updated_date: null,
        }),
      });

      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      // Mock discovery and extraction
      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://a.com/p', title: 'Product A', source: 'google' },
        { url: 'https://b.com/p', title: 'Product B', source: 'bing' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://a.com/p', markdown: OOS_MARKDOWN, extractedAt: new Date() },
        { url: 'https://b.com/p', markdown: OOS_MARKDOWN, extractedAt: new Date() },
      ];

      const result = await engine.procure('DDR5 RAM', 'DDR5 RAM');

      expect(result.status).toBe(ProcurementStatus.OUT_OF_STOCK);
      expect(result.risk_flags).toContain('ALL_SOURCES_OOS');
      expect(result.verified_sources_count).toBe(2);
    });

    test('returns VERIFIED status with high-confidence sources', async () => {
      const client = mockGeminiClient({
        generateStructuredJson: async () => ({
          price: 82.50,
          stock_status: 'in_stock',
          shipping_location: 'United States',
          last_updated_date: '2026-04-01',
        }),
      });

      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://newegg.com/p', title: 'DDR5', source: 'google' },
        { url: 'https://amazon.com/p', title: 'DDR5', source: 'bing' },
        { url: 'https://microcenter.com/p', title: 'DDR5', source: 'duckduckgo' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://newegg.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
        { url: 'https://amazon.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
        { url: 'https://microcenter.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
      ];

      const result = await engine.procure('DDR5 32GB', 'DDR5 RAM');

      expect(result.status).toBe(ProcurementStatus.VERIFIED);
      expect(result.verified_sources_count).toBe(3);
      expect(result.best_price).toBe(82.50);
      expect(result.confidence_score).toBe(0.85);
      expect(result.risk_flags).not.toContain('ALL_SOURCES_OOS');
      expect(result.shopping_options.length).toBeGreaterThan(0);
    });

    test('flags SUSPECT status when price anomaly detected', async () => {
      const client = mockGeminiClient({
        generateStructuredJson: async () => ({
          price: 15, // Way below DDR5 baseline of $85
          stock_status: 'in_stock',
          shipping_location: 'China',
          last_updated_date: '2026-04-01',
        }),
      });

      const engine = new VerifiedProcurementEngine({
        verification_backend: 'gemini',
        anomaly_threshold_pct: 50,
        searxng_base_url: 'http://0.0.0.0:1', // prevent real 4th-source call
      }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async (query: string) => {
        // Return empty for 4th-source verification attempt
        if (query.includes('current retail price')) return [];
        return [{ url: 'https://sketchy.example.com/p', title: 'DDR5 Cheap', source: 'google' }];
      };
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://sketchy.example.com/p', markdown: '$15.00 - In Stock - Ships from China', extractedAt: new Date() },
      ];

      const result = await engine.procure('DDR5 RAM', 'DDR5 RAM');

      expect(result.status).toBe(ProcurementStatus.SUSPECT);
      expect(result.risk_flags).toContain('PRICE_ANOMALY');
      expect(result.risk_flags).toContain('SINGLE_SOURCE_ONLY');
      expect(result.price_anomaly).not.toBeNull();
      expect(result.price_anomaly!.detected).toBe(true);
      expect(result.price_anomaly!.deviation_pct).toBeGreaterThan(50);
    });

    test('appends logistics delay for Hormuz/Red Sea shipping', async () => {
      const client = mockGeminiClient({
        generateStructuredJson: async () => ({
          price: 90,
          stock_status: 'in_stock',
          shipping_location: 'Bandar Abbas, Iran',
          last_updated_date: '2026-04-01',
        }),
      });

      const engine = new VerifiedProcurementEngine({
        verification_backend: 'gemini',
        enable_logistics_risk: true,
      }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://irshop.example.com/p', title: 'RAM', source: 'google' },
        { url: 'https://irshop2.example.com/p', title: 'RAM', source: 'bing' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://irshop.example.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
        { url: 'https://irshop2.example.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
      ];

      const result = await engine.procure('DDR5 RAM', 'DDR5 RAM');

      expect(result.risk_flags).toContain('LOGISTICS_DELAY_HORMUZ');
      expect(result.logistics_delay_estimate_days).toBe(21);
      expect(result.logistics_risks.length).toBeGreaterThan(0);
      expect(result.logistics_risks[0].zone).toBe('Hormuz Strait');
    });

    test('returns pipeline_duration_ms and timestamp', async () => {
      const client = mockGeminiClient();
      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://a.com/p', title: 'P', source: 'google' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://a.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
      ];

      const result = await engine.procure('test', 'SSD');

      expect(result.pipeline_duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // BUILD VERIFICATION PROMPT
  // =========================================================================

  test.describe('buildVerificationPrompt', () => {

    test('includes markdown content in prompt', () => {
      const engine = new VerifiedProcurementEngine({}, null);
      // @ts-ignore
      const prompt = engine.buildVerificationPrompt('# Product Page\nPrice: $99');
      expect(prompt).toContain('# Product Page');
      expect(prompt).toContain('Price: $99');
      expect(prompt).toContain('stock_status');
      expect(prompt).toContain('shipping_location');
    });
  });

  // =========================================================================
  // GEOPOL RISK MAP — data integrity
  // =========================================================================

  test.describe('GEOPOL_RISK_MAP data', () => {

    test('contains Hormuz and Red Sea zones', () => {
      const names = GEOPOL_RISK_MAP.map(z => z.name);
      expect(names).toContain('Hormuz Strait');
      expect(names).toContain('Red Sea');
    });

    test('all zones have positive delay days', () => {
      for (const zone of GEOPOL_RISK_MAP) {
        expect(zone.default_delay_days).toBeGreaterThan(0);
      }
    });

    test('all zones have at least one keyword', () => {
      for (const zone of GEOPOL_RISK_MAP) {
        expect(zone.keywords.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // DEFAULT CATEGORY BASELINES — data integrity
  // =========================================================================

  test.describe('DEFAULT_CATEGORY_BASELINES', () => {

    test('contains DDR5 RAM baseline', () => {
      expect(DEFAULT_CATEGORY_BASELINES['DDR5 RAM']).toBeDefined();
      expect(DEFAULT_CATEGORY_BASELINES['DDR5 RAM']).toBeGreaterThan(0);
    });

    test('contains GPU baseline', () => {
      expect(DEFAULT_CATEGORY_BASELINES['GPU']).toBeDefined();
      expect(DEFAULT_CATEGORY_BASELINES['GPU']).toBeGreaterThan(0);
    });

    test('all baselines are positive numbers', () => {
      for (const [key, val] of Object.entries(DEFAULT_CATEGORY_BASELINES)) {
        expect(val).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // BACKWARD COMPATIBILITY — shopping_options
  // =========================================================================

  test.describe('backward compatibility', () => {

    test('ProcurementResult contains shopping_options array', async () => {
      const client = mockGeminiClient();
      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://a.com/p', title: 'P', source: 'google' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://a.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
      ];

      const result = await engine.procure('NVMe SSD', 'NVMe SSD');

      expect(Array.isArray(result.shopping_options)).toBe(true);
      expect(result.shopping_options.length).toBeGreaterThan(0);

      const opt = result.shopping_options[0];
      expect(opt).toHaveProperty('title');
      expect(opt).toHaveProperty('url');
      expect(opt).toHaveProperty('source');
    });
  });

  // =========================================================================
  // GRACEFUL FALLBACK — ERROR status allows fallthrough to legacy search
  // =========================================================================

  test.describe('graceful fallback on pipeline failure', () => {

    test('ERROR result from unreachable SearXNG has status ERROR for fallback detection', async () => {
      const engine = new VerifiedProcurementEngine({
        searxng_base_url: 'http://0.0.0.0:1', // unreachable
      }, mockGeminiClient());

      const result = await engine.procure('DDR5 RAM', 'DDR5 RAM');

      // The App.tsx handler checks `procResult.status !== 'ERROR'` to decide fallback
      expect(result.status).toBe(ProcurementStatus.ERROR);
      expect(result.verified_sources_count).toBe(0);
      expect(result.best_price).toBeNull();
      expect(result.best_source).toBeNull();
      expect(result.all_sources).toHaveLength(0);
      expect(result.confidence_score).toBe(0);
    });

    test('ERROR result shopping_options contains failure message', async () => {
      const engine = new VerifiedProcurementEngine({
        searxng_base_url: 'http://0.0.0.0:1',
      }, mockGeminiClient());

      const result = await engine.procure('GPU', 'GPU');

      expect(result.shopping_options).toHaveLength(1);
      expect(result.shopping_options[0].title).toContain('Procurement failed');
      expect(result.shopping_options[0].url).toBe('');
    });

    test('non-ERROR statuses do not trigger fallback (VERIFIED)', async () => {
      const client = mockGeminiClient();
      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://a.com/p', title: 'P', source: 'google' },
        { url: 'https://b.com/p', title: 'P', source: 'bing' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://a.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
        { url: 'https://b.com/p', markdown: PRODUCT_MARKDOWN, extractedAt: new Date() },
      ];

      const result = await engine.procure('SSD', 'SSD');

      // VERIFIED / SUSPECT / OUT_OF_STOCK should NOT trigger fallback
      expect(result.status).not.toBe(ProcurementStatus.ERROR);
      expect(result.verified_sources_count).toBeGreaterThan(0);
    });

    test('OUT_OF_STOCK status does not trigger fallback', async () => {
      const client = mockGeminiClient({
        generateStructuredJson: async () => ({
          price: 89.99,
          stock_status: 'out_of_stock',
          shipping_location: 'US',
          last_updated_date: null,
        }),
      });

      const engine = new VerifiedProcurementEngine({ verification_backend: 'gemini' }, client);

      // @ts-ignore
      engine['stageDiscovery'] = async () => [
        { url: 'https://a.com/p', title: 'P', source: 'google' },
      ];
      // @ts-ignore
      engine['stageExtraction'] = async () => [
        { url: 'https://a.com/p', markdown: 'Out of Stock - $89.99', extractedAt: new Date() },
      ];

      const result = await engine.procure('DDR5', 'DDR5 RAM');

      expect(result.status).toBe(ProcurementStatus.OUT_OF_STOCK);
      // OUT_OF_STOCK is a valid result — should NOT fall back to legacy
      expect(result.status).not.toBe(ProcurementStatus.ERROR);
    });
  });

  // =========================================================================
  // SOURCE CODE GUARD — App.tsx fallback check
  // =========================================================================

  test.describe('App.tsx fallback integration guard', () => {

    test('handleSourcePart checks for ERROR status before using procurement results', () => {
      const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf-8');

      // Verify the fallback guard exists
      expect(appSource).toContain("procResult.status !== 'ERROR'");
      // Verify legacy fallback path is still present
      expect(appSource).toContain('findPartSources');
      expect(appSource).toContain('findLocalSuppliers');
    });
  });
});
