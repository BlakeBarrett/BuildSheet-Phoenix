/**
 * VerifiedProcurementEngine — "Verify-Before-Display" protocol.
 *
 * Multi-stage pipeline:
 *   1. Discovery  — SearXNG local API → top 5 product landing pages
 *   2. Extraction — Firecrawl → scrape Markdown from those pages
 *   3. Verification — Cloud API (default) or local LLM → extract price, stock, shipping, date
 *
 * Includes RAMpocalypse price anomaly detection and Hormuz/Red Sea logistics risk.
 */

import {
  ProcurementResult,
  ProcurementStatus,
  ProcurementEngineConfig,
  DEFAULT_PROCUREMENT_CONFIG,
  DiscoveryResult,
  ExtractedPageData,
  VerifiedPartData,
  PriceAnomaly,
  LogisticsRisk,
  RiskFlag,
  GEOPOL_RISK_MAP,
  DEFAULT_CATEGORY_BASELINES,
  CategoryPriceHistory,
  VerificationBackend,
} from './procurementTypes.ts';
import { ShoppingOption } from '../types.ts';
import { getLocalProvider, LocalModelProvider } from './localAiService.ts';

/**
 * Minimal interface for the AI client used in Stage 3 verification.
 * Avoids tight coupling to CloudAIService — any object with this shape works.
 */
export interface AIVerificationClient {
  generateStructuredJson(prompt: string, schema: Record<string, any>): Promise<any>;
}

// ---------------------------------------------------------------------------
// Price history cache (in-memory, per-session)
// ---------------------------------------------------------------------------
const categoryPriceCache = new Map<string, CategoryPriceHistory>();

function getCategoryBaseline(category: string): number {
  const cached = categoryPriceCache.get(category.toLowerCase());
  if (cached && cached.sample_count > 0) return cached.rolling_avg_7d;

  // Fuzzy match against defaults
  const key = Object.keys(DEFAULT_CATEGORY_BASELINES).find(
    k => category.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(category.toLowerCase())
  );
  return key ? DEFAULT_CATEGORY_BASELINES[key] : 0;
}

function updateCategoryBaseline(category: string, price: number): void {
  const key = category.toLowerCase();
  const existing = categoryPriceCache.get(key);
  if (existing) {
    // Exponential moving average approximation for 7-day rolling
    const alpha = 2 / (existing.sample_count + 1);
    existing.rolling_avg_7d = existing.rolling_avg_7d * (1 - alpha) + price * alpha;
    existing.sample_count++;
    existing.last_updated = new Date();
  } else {
    categoryPriceCache.set(key, {
      category: key,
      rolling_avg_7d: price,
      sample_count: 1,
      last_updated: new Date(),
    });
  }
}

// ---------------------------------------------------------------------------
// VerifiedProcurementEngine
// ---------------------------------------------------------------------------
export class VerifiedProcurementEngine {
  private config: ProcurementEngineConfig;
  private aiClient: AIVerificationClient | null;

  constructor(config?: Partial<ProcurementEngineConfig>, aiClient?: AIVerificationClient | null) {
    this.config = { ...DEFAULT_PROCUREMENT_CONFIG, ...config };
    this.aiClient = aiClient ?? null;

    // Allow localStorage override for verification backend
    try {
      const savedBackend = localStorage.getItem('procurementVerificationBackend');
      // Accept 'gemini' as a legacy alias for 'cloud'
      if (savedBackend === 'local' || savedBackend === 'cloud' || savedBackend === 'gemini') {
        this.config.verification_backend = savedBackend === 'gemini' ? 'cloud' : savedBackend as VerificationBackend;
      }
    } catch {
      // localStorage unavailable (e.g. Node.js test environment)
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Full Verify-Before-Display pipeline.
   * Returns a typed ProcurementResult instead of raw strings.
   */
  async procure(query: string, category: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<ProcurementResult> {
    const t0 = performance.now();
    const riskFlags: RiskFlag[] = [];
    let status: ProcurementStatus = ProcurementStatus.UNVERIFIED;

    try {
      // --- Stage 1: Discovery via SearXNG ---
      const discovered = await this.stageDiscovery(query, designContext, localeContext, preferredVendors);

      if (discovered.length === 0) {
        return this.buildEmptyResult(query, t0, 'No results from discovery stage');
      }

      // --- Stage 2: Extraction via Firecrawl ---
      const pages = await this.stageExtraction(discovered);

      if (pages.length === 0) {
        return this.buildEmptyResult(query, t0, 'Extraction returned no content');
      }

      // --- Stage 3: Verification via Mini-Gemma ---
      const verified = await this.stageVerification(pages);

      // --- RAMpocalypse: All sources out of stock? ---
      const allOOS = verified.length > 0 && verified.every(v => v.stock_status === 'out_of_stock');
      if (allOOS) {
        riskFlags.push('ALL_SOURCES_OOS');
        return this.buildResult({
          query, verified, riskFlags,
          status: ProcurementStatus.OUT_OF_STOCK,
          category, t0,
          anomaly: null,
        });
      }

      // Filter to in-stock / limited / backorder only for price analysis
      const available = verified.filter(v =>
        v.stock_status === 'in_stock' || v.stock_status === 'limited' || v.stock_status === 'backorder'
      );

      // --- Price Anomaly Detection ---
      let anomaly: PriceAnomaly | null = null;
      const bestPriced = this.pickBestSource(available.length > 0 ? available : verified);
      if (bestPriced?.price != null) {
        anomaly = await this.priceAnomalyDetector(bestPriced.price, category, discovered);
        if (anomaly.detected) {
          riskFlags.push('PRICE_ANOMALY');
          status = ProcurementStatus.SUSPECT;
        }
      }

      // --- Logistics Risk ---
      const logisticsRisks: LogisticsRisk[] = [];
      if (this.config.enable_logistics_risk) {
        for (const src of verified) {
          const risk = this.evaluateLogisticsRisk(src.shipping_location);
          if (risk) logisticsRisks.push(risk);
        }
        if (logisticsRisks.length > 0) {
          for (const lr of logisticsRisks) {
            const flag: RiskFlag = lr.zone.toLowerCase().includes('hormuz')
              ? 'LOGISTICS_DELAY_HORMUZ'
              : 'LOGISTICS_DELAY_RED_SEA';
            if (!riskFlags.includes(flag)) riskFlags.push(flag);
          }
        }
      }

      // Confidence
      if (verified.length === 1) riskFlags.push('SINGLE_SOURCE_ONLY');
      const avgConfidence = verified.reduce((s, v) => s + v.confidence, 0) / (verified.length || 1);
      if (avgConfidence < 0.5) riskFlags.push('LOW_CONFIDENCE');

      if (status !== ProcurementStatus.SUSPECT) {
        status = avgConfidence >= 0.6 ? ProcurementStatus.VERIFIED : ProcurementStatus.UNVERIFIED;
      }

      // Update rolling price history for this category
      if (bestPriced?.price != null) {
        updateCategoryBaseline(category, bestPriced.price);
      }

      return this.buildResult({ query, verified, riskFlags, status, category, t0, anomaly, logisticsRisks, preferredVendors });

    } catch (err) {
      console.error('[ProcurementEngine] Pipeline error:', err);
      return this.buildEmptyResult(query, t0, String(err));
    }
  }

  // =========================================================================
  // STAGE 1: DISCOVERY — SearXNG
  // =========================================================================

  private async stageDiscovery(query: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<DiscoveryResult[]> {
    let searchQuery = designContext
      ? `${query} buy price in stock ${designContext}`
      : `${query} buy price in stock`;

    if (localeContext) {
      searchQuery += ` ${localeContext}`;
    }

    // Bias search toward preferred vendor domains
    // Bias search toward preferred vendor domains using soft keywords instead of strict site: operators
    // which can break relevance or cause false-positive matches on the wrong vendor.
    if (preferredVendors && preferredVendors.length > 0) {
      const vendorKeywords = preferredVendors
        .map(v => {
          try {
            return new URL(v).hostname.replace(/^(www|store|shop)\./, '').split('.')[0];
          } catch { return v; }
        })
        .join(' OR ');
      searchQuery += ` (${vendorKeywords})`;
    }

    const url = new URL('/search', this.config.searxng_base_url);
    url.searchParams.set('q', searchQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('categories', 'general,shopping');
    url.searchParams.set('engines', 'google,bing,duckduckgo');
    if (localeContext) {
      // Pass the language hint (e.g. 'sw-KE' or 'fr') if it roughly matches a locale param format.
      // E.g. Searxng language format is often short string
      url.searchParams.set('language', localeContext.toLowerCase());
    }
    url.searchParams.set('pageno', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.verification_timeout_ms);

    try {
      const resp = await fetch(url.toString(), { signal: controller.signal });
      if (!resp.ok) throw new Error(`SearXNG returned ${resp.status}`);
      const data = await resp.json();

      const results: DiscoveryResult[] = (data.results || [])
        .slice(0, this.config.max_discovery_results)
        .map((r: any) => ({
          url: r.url,
          title: r.title || '',
          source: r.engine || 'searxng',
          thumbnail: r.img_src || r.thumbnail || undefined,
        }));

      return results;
    } catch (err) {
      console.warn('[ProcurementEngine] Discovery stage failed, falling back empty:', err);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  // =========================================================================
  // STAGE 2: EXTRACTION — Firecrawl
  // =========================================================================

  private async stageExtraction(discovered: DiscoveryResult[]): Promise<ExtractedPageData[]> {
    const results: ExtractedPageData[] = [];

    const extractOne = async (d: DiscoveryResult): Promise<ExtractedPageData | null> => {
      try {
        const scrapeUrl = new URL('/v1/scrape', this.config.firecrawl_base_url);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.firecrawl_api_key) {
          headers['Authorization'] = `Bearer ${this.config.firecrawl_api_key}`;
        }

        const resp = await fetch(scrapeUrl.toString(), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: d.url,
            formats: ['markdown'],
            timeout: this.config.verification_timeout_ms,
          }),
        });

        if (!resp.ok) return null;
        const body = await resp.json();
        const markdown: string = body.data?.markdown || body.markdown || '';
        if (!markdown || markdown.length < 50) return null;

        // Extract thumbnail: prefer Firecrawl og:image metadata, fall back to SearXNG discovery thumbnail
        const ogImage: string | undefined = body.data?.metadata?.ogImage || body.data?.metadata?.['og:image'] || undefined;
        const thumbnail = ogImage || d.thumbnail || undefined;

        return { url: d.url, markdown, extractedAt: new Date(), thumbnail };
      } catch {
        return null;
      }
    };

    // Scrape all pages in parallel
    const settled = await Promise.allSettled(discovered.map(extractOne));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) results.push(s.value);
    }

    return results;
  }

  // =========================================================================
  // STAGE 3: VERIFICATION — Cloud AI (default) or Local LLM
  // =========================================================================

  private async stageVerification(pages: ExtractedPageData[]): Promise<VerifiedPartData[]> {
    if (this.config.verification_backend === 'cloud' && this.aiClient) {
      return this.verifyViaCloud(pages);
    }

    if (this.config.verification_backend === 'local') {
      const provider = this.getLocalVerificationProvider();
      if (provider) return this.verifyViaLocalLLM(pages, provider);
    }

    // Final fallback: Cloud AI if available, then local, then regex
    if (this.aiClient) return this.verifyViaCloud(pages);
    const provider = this.getLocalVerificationProvider();
    if (provider) return this.verifyViaLocalLLM(pages, provider);
    return pages.map(p => this.regexFallbackExtract(p));
  }

  private async verifyViaCloud(pages: ExtractedPageData[]): Promise<VerifiedPartData[]> {
    const results: VerifiedPartData[] = [];
    const schema = {
      type: 'OBJECT',
      properties: {
        price: { type: 'NUMBER', nullable: true },
        stock_status: { type: 'STRING' },
        shipping_location: { type: 'STRING', nullable: true },
        last_updated_date: { type: 'STRING', nullable: true },
      },
      required: ['stock_status'],
    };

    for (const page of pages) {
      try {
        const truncated = page.markdown.slice(0, 6000);
        const prompt = this.buildVerificationPrompt(truncated);
        const parsed = await this.aiClient!.generateStructuredJson(prompt, schema);

        if (parsed) {
          results.push(this.parseVerifiedData(parsed, page));
        } else {
          results.push(this.regexFallbackExtract(page));
        }
      } catch {
        results.push(this.regexFallbackExtract(page));
      }
    }
    return results;
  }

  private async verifyViaLocalLLM(pages: ExtractedPageData[], provider: LocalModelProvider): Promise<VerifiedPartData[]> {
    const results: VerifiedPartData[] = [];

    for (const page of pages) {
      try {
        const truncated = page.markdown.slice(0, 6000);
        const prompt = this.buildVerificationPrompt(truncated);

        const resp = await fetch(provider.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: provider.id,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 256,
          }),
        });

        if (!resp.ok) {
          results.push(this.regexFallbackExtract(page));
          continue;
        }

        const data = await resp.json();
        const content: string = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
          results.push(this.regexFallbackExtract(page));
          continue;
        }

        results.push(this.parseVerifiedData(JSON.parse(jsonMatch[0]), page));
      } catch {
        results.push(this.regexFallbackExtract(page));
      }
    }

    return results;
  }

  private buildVerificationPrompt(markdownContent: string): string {
    return `You are a structured data extractor. Analyze the following product page markdown and return ONLY a JSON object with these exact fields:
{
  "price": <number or null>,
  "stock_status": "in_stock" | "out_of_stock" | "limited" | "backorder" | "unknown",
  "shipping_location": "<country or region string, or null>",
  "last_updated_date": "<ISO date string or null>"
}

Rules:
- price must be a number in USD (no currency symbol). Convert if needed. null if not found.
- stock_status must be one of the exact enum values above.
- shipping_location should be the country/region the item ships FROM, not to.
- last_updated_date is when the listing was last updated. null if unknown.

Product page markdown:
---
${markdownContent}
---

Return ONLY valid JSON, no explanation.`;
  }

  private parseVerifiedData(parsed: any, page: ExtractedPageData): VerifiedPartData {
    let hostname: string;
    try { hostname = new URL(page.url).hostname; }
    catch { hostname = 'unknown'; }

    return {
      price: typeof parsed.price === 'number' ? parsed.price : null,
      stock_status: ['in_stock', 'out_of_stock', 'limited', 'backorder', 'unknown'].includes(parsed.stock_status)
        ? parsed.stock_status
        : 'unknown',
      shipping_location: typeof parsed.shipping_location === 'string' ? parsed.shipping_location : null,
      last_updated_date: typeof parsed.last_updated_date === 'string' ? parsed.last_updated_date : null,
      source_url: page.url,
      source_name: hostname,
      confidence: 0.85,
      thumbnail: page.thumbnail,
    };
  }

  // =========================================================================
  // PRICE ANOMALY DETECTOR — "RAMpocalypse" Logic
  // =========================================================================

  /**
   * If found price is >threshold% below the 7-day rolling average for the category,
   * flag as SUSPECT and attempt 4th-source verification.
   */
  async priceAnomalyDetector(
    foundPrice: number,
    category: string,
    discoveredSources: DiscoveryResult[],
  ): Promise<PriceAnomaly> {
    const baseline = getCategoryBaseline(category);

    // No baseline → can't detect anomaly
    if (baseline === 0) {
      return {
        detected: false,
        found_price: foundPrice,
        rolling_avg_7d: 0,
        deviation_pct: 0,
        category,
        fourth_source_verified: false,
      };
    }

    const deviationPct = ((baseline - foundPrice) / baseline) * 100;
    const isAnomaly = deviationPct > this.config.anomaly_threshold_pct;

    let fourthSourceVerified = false;
    let fourthSourceUrl: string | undefined;

    if (isAnomaly) {
      // Attempt 4th-source verification via a follow-up SearXNG query
      try {
        const verifyResults = await this.stageDiscovery(`${category} current retail price USD 2024`);
        const extra = verifyResults.find(r =>
          !discoveredSources.some(d => d.url === r.url)
        );
        if (extra) {
          fourthSourceUrl = extra.url;
          fourthSourceVerified = true;
        }
      } catch {
        // 4th source verification failed — anomaly stands unverified
      }
    }

    return {
      detected: isAnomaly,
      found_price: foundPrice,
      rolling_avg_7d: baseline,
      deviation_pct: Math.round(deviationPct * 100) / 100,
      category,
      fourth_source_verified: fourthSourceVerified,
      fourth_source_url: fourthSourceUrl,
    };
  }

  // =========================================================================
  // LOGISTICS RISK — Hormuz / Red Sea buffer zones
  // =========================================================================

  private evaluateLogisticsRisk(shippingLocation: string | null): LogisticsRisk | null {
    if (!shippingLocation) return null;

    const loc = shippingLocation.toLowerCase();
    for (const zone of GEOPOL_RISK_MAP) {
      if (zone.keywords.some(kw => loc.includes(kw))) {
        return {
          zone: zone.name,
          delay_estimate_days: zone.default_delay_days,
          shipping_location: shippingLocation,
        };
      }
    }
    return null;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private getLocalVerificationProvider(): LocalModelProvider | null {
    // Check for a dedicated procurement model provider, else fall back to general local model
    return getLocalProvider('localProcurementProvider')
      || getLocalProvider('localProvider');
  }

  /**
   * Regex-based fallback when no local LLM is available.
   * Extracts price and stock keywords from raw Markdown.
   */
  private regexFallbackExtract(page: ExtractedPageData): VerifiedPartData {
    const text = page.markdown;

    // Price extraction
    const priceMatch = text.match(/\$\s?(\d{1,6}(?:[,.]\d{2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;

    // Stock status heuristics
    let stock_status: VerifiedPartData['stock_status'] = 'unknown';
    const lower = text.toLowerCase();
    if (lower.includes('in stock') || lower.includes('in-stock') || lower.includes('available'))
      stock_status = 'in_stock';
    else if (lower.includes('out of stock') || lower.includes('sold out') || lower.includes('unavailable'))
      stock_status = 'out_of_stock';
    else if (lower.includes('limited') || lower.includes('few left') || lower.includes('low stock'))
      stock_status = 'limited';
    else if (lower.includes('backorder') || lower.includes('pre-order'))
      stock_status = 'backorder';

    let hostname: string;
    try { hostname = new URL(page.url).hostname; }
    catch { hostname = 'unknown'; }

    return {
      price,
      stock_status,
      shipping_location: null,
      last_updated_date: null,
      source_url: page.url,
      source_name: hostname,
      confidence: 0.35, // Low confidence for regex-only extraction
      thumbnail: page.thumbnail,
    };
  }

  private pickBestSource(sources: VerifiedPartData[]): VerifiedPartData | null {
    const withPrice = sources.filter(s => s.price != null);
    if (withPrice.length === 0) return sources[0] || null;
    // Prefer highest confidence, then lowest price
    return withPrice.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    })[0];
  }

  private buildResult(opts: {
    query: string;
    verified: VerifiedPartData[];
    riskFlags: RiskFlag[];
    status: ProcurementStatus;
    category: string;
    t0: number;
    anomaly: PriceAnomaly | null;
    logisticsRisks?: LogisticsRisk[];
    preferredVendors?: string[];
  }): ProcurementResult {
    const best = this.pickBestSource(opts.verified);
    const maxDelay = (opts.logisticsRisks || []).reduce((m, r) => Math.max(m, r.delay_estimate_days), 0);

    // Sort shopping options so preferred vendors appear first
    let shoppingOptions = opts.verified.map(v => this.toShoppingOption(v));
    if (opts.preferredVendors && opts.preferredVendors.length > 0) {
      const preferredHosts = opts.preferredVendors.map(v => {
        try { return new URL(v).hostname.toLowerCase(); } catch { return v.toLowerCase(); }
      });
      shoppingOptions.sort((a, b) => {
        const aPreferred = preferredHosts.some(h => (a.url || '').toLowerCase().includes(h)) ? 0 : 1;
        const bPreferred = preferredHosts.some(h => (b.url || '').toLowerCase().includes(h)) ? 0 : 1;
        return aPreferred - bPreferred;
      });
    }

    return {
      query: opts.query,
      status: opts.status,
      confidence_score: opts.verified.reduce((s, v) => s + v.confidence, 0) / (opts.verified.length || 1),
      verified_sources_count: opts.verified.length,
      risk_flags: opts.riskFlags,
      best_price: best?.price ?? null,
      best_source: best,
      all_sources: opts.verified,
      price_anomaly: opts.anomaly,
      logistics_risks: opts.logisticsRisks || [],
      logistics_delay_estimate_days: maxDelay,
      pipeline_duration_ms: Math.round(performance.now() - opts.t0),
      timestamp: new Date(),
      shopping_options: shoppingOptions,
    };
  }

  private buildEmptyResult(query: string, t0: number, reason: string): ProcurementResult {
    return {
      query,
      status: ProcurementStatus.ERROR,
      confidence_score: 0,
      verified_sources_count: 0,
      risk_flags: [],
      best_price: null,
      best_source: null,
      all_sources: [],
      price_anomaly: null,
      logistics_risks: [],
      logistics_delay_estimate_days: 0,
      pipeline_duration_ms: Math.round(performance.now() - t0),
      timestamp: new Date(),
      shopping_options: [{ title: `Procurement failed: ${reason}`, url: '', source: 'BuildSheet' }],
    };
  }

  /** Convert a VerifiedPartData to a legacy ShoppingOption for backwards compat. */
  private toShoppingOption(v: VerifiedPartData): ShoppingOption {
    const priceStr = v.price != null ? `$${v.price.toFixed(2)}` : undefined;
    const stockLabel = v.stock_status !== 'unknown' ? ` [${v.stock_status.replace('_', ' ')}]` : '';
    return {
      title: `${v.source_name}${stockLabel}`,
      url: v.source_url,
      source: v.source_name,
      price: priceStr,
      isEstimated: v.confidence < 0.5,
      thumbnail: v.thumbnail,
    };
  }
}
