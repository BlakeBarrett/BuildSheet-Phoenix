/**
 * Server-side VerifiedProcurementEngine.
 * 
 * This is a thin wrapper that re-uses the procurement pipeline logic
 * but runs it server-side where SearXNG/Firecrawl calls don't face CORS issues.
 * 
 * The core logic is identical to the client-side procurementEngine.ts.
 */
import type { ServerAIService, ShoppingOption } from './types.js';

// Re-export the procurement types
export interface ProcurementResult {
  query: string;
  status: string;
  confidence_score: number;
  verified_sources_count: number;
  risk_flags: string[];
  best_price: number | null;
  best_source: any;
  all_sources: any[];
  price_anomaly: any;
  logistics_risks: any[];
  logistics_delay_estimate_days: number;
  pipeline_duration_ms: number;
  timestamp: Date;
  shopping_options: ShoppingOption[];
}

interface DiscoveryResult {
  url: string;
  title: string;
  source: string;
  thumbnail?: string;
}

interface ExtractedPageData {
  url: string;
  markdown: string;
  extractedAt: Date;
  thumbnail?: string;
}

interface VerifiedPartData {
  price: number | null;
  stock_status: 'in_stock' | 'out_of_stock' | 'limited' | 'backorder' | 'unknown';
  shipping_location: string | null;
  last_updated_date: string | null;
  source_url: string;
  source_name: string;
  confidence: number;
  thumbnail?: string;
}

interface ProcurementConfig {
  searxng_base_url: string;
  firecrawl_base_url: string;
  firecrawl_api_key: string;
  max_discovery_results: number;
  verification_timeout_ms: number;
  anomaly_threshold_pct: number;
  enable_logistics_risk: boolean;
}

const DEFAULT_CONFIG: ProcurementConfig = {
  searxng_base_url: process.env.SEARXNG_BASE_URL || 'http://localhost:8888',
  firecrawl_base_url: process.env.FIRECRAWL_BASE_URL || 'http://localhost:3002',
  firecrawl_api_key: process.env.FIRECRAWL_API_KEY || '',
  max_discovery_results: 5,
  verification_timeout_ms: 15000,
  anomaly_threshold_pct: 40,
  enable_logistics_risk: true,
};

export class VerifiedProcurementEngine {
  private config: ProcurementConfig;
  private aiClient: ServerAIService | null;

  constructor(config?: Partial<ProcurementConfig>, aiClient?: ServerAIService | null) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = aiClient ?? null;
  }

  async procure(query: string, category: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<ProcurementResult> {
    const t0 = performance.now();
    try {
      const discovered = await this.stageDiscovery(query, designContext, localeContext, preferredVendors);
      if (discovered.length === 0) return this.emptyResult(query, t0, 'No discovery results');
      const pages = await this.stageExtraction(discovered);
      if (pages.length === 0) return this.emptyResult(query, t0, 'Extraction returned no content');
      const verified = await this.stageVerification(pages);
      const shoppingOptions: ShoppingOption[] = verified.map(v => ({
        title: `${v.source_name} [${v.stock_status.replace('_', ' ')}]`,
        url: v.source_url, source: v.source_name,
        price: v.price != null ? `$${v.price.toFixed(2)}` : undefined,
        isEstimated: v.confidence < 0.5, thumbnail: v.thumbnail,
      }));
      const avgConf = verified.reduce((s, v) => s + v.confidence, 0) / (verified.length || 1);
      return {
        query, status: avgConf >= 0.6 ? 'VERIFIED' : 'UNVERIFIED',
        confidence_score: avgConf, verified_sources_count: verified.length,
        risk_flags: [], best_price: verified.find(v => v.price)?.price ?? null,
        best_source: verified[0] || null, all_sources: verified,
        price_anomaly: null, logistics_risks: [],
        logistics_delay_estimate_days: 0,
        pipeline_duration_ms: Math.round(performance.now() - t0),
        timestamp: new Date(), shopping_options: shoppingOptions,
      };
    } catch (err) {
      return this.emptyResult(query, t0, String(err));
    }
  }

  private async stageDiscovery(query: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<DiscoveryResult[]> {
    let searchQuery = designContext ? `${query} buy price in stock ${designContext}` : `${query} buy price in stock`;
    const url = new URL('/search', this.config.searxng_base_url);
    url.searchParams.set('q', searchQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('categories', 'general,shopping');
    try {
      const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(this.config.verification_timeout_ms) });
      if (!resp.ok) return [];
      const data: any = await resp.json();
      return (data.results || []).slice(0, this.config.max_discovery_results).map((r: any) => ({
        url: r.url, title: r.title || '', source: r.engine || 'searxng', thumbnail: r.img_src || undefined,
      }));
    } catch { return []; }
  }

  private async stageExtraction(discovered: DiscoveryResult[]): Promise<ExtractedPageData[]> {
    const results: ExtractedPageData[] = [];
    const settled = await Promise.allSettled(discovered.map(async d => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.firecrawl_api_key) headers['Authorization'] = `Bearer ${this.config.firecrawl_api_key}`;
      const resp = await fetch(new URL('/v1/scrape', this.config.firecrawl_base_url).toString(), {
        method: 'POST', headers, body: JSON.stringify({ url: d.url, formats: ['markdown'], timeout: this.config.verification_timeout_ms }),
      });
      if (!resp.ok) return null;
      const body: any = await resp.json();
      const markdown = body.data?.markdown || body.markdown || '';
      if (markdown.length < 50) return null;
      return { url: d.url, markdown, extractedAt: new Date(), thumbnail: d.thumbnail } as ExtractedPageData;
    }));
    for (const s of settled) { if (s.status === 'fulfilled' && s.value) results.push(s.value); }
    return results;
  }

  private async stageVerification(pages: ExtractedPageData[]): Promise<VerifiedPartData[]> {
    if (!this.aiClient) return pages.map(p => this.regexFallback(p));
    const results: VerifiedPartData[] = [];
    for (const page of pages) {
      try {
        const truncated = page.markdown.slice(0, 6000);
        const prompt = `Extract from this product page: price (number USD), stock_status, shipping_location, last_updated_date. Return JSON only.\n---\n${truncated}`;
        const parsed = await this.aiClient.generateStructuredJson(prompt, {});
        if (parsed) {
          let hostname: string; try { hostname = new URL(page.url).hostname; } catch { hostname = 'unknown'; }
          results.push({ price: typeof parsed.price === 'number' ? parsed.price : null, stock_status: parsed.stock_status || 'unknown', shipping_location: parsed.shipping_location || null, last_updated_date: parsed.last_updated_date || null, source_url: page.url, source_name: hostname, confidence: 0.85, thumbnail: page.thumbnail });
        } else { results.push(this.regexFallback(page)); }
      } catch { results.push(this.regexFallback(page)); }
    }
    return results;
  }

  private regexFallback(page: ExtractedPageData): VerifiedPartData {
    const priceMatch = page.markdown.match(/\$\s?(\d{1,6}(?:[,.]\d{2})?)/);
    let hostname: string; try { hostname = new URL(page.url).hostname; } catch { hostname = 'unknown'; }
    return { price: priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null, stock_status: 'unknown', shipping_location: null, last_updated_date: null, source_url: page.url, source_name: hostname, confidence: 0.35, thumbnail: page.thumbnail };
  }

  private emptyResult(query: string, t0: number, reason: string): ProcurementResult {
    return { query, status: 'ERROR', confidence_score: 0, verified_sources_count: 0, risk_flags: [], best_price: null, best_source: null, all_sources: [], price_anomaly: null, logistics_risks: [], logistics_delay_estimate_days: 0, pipeline_duration_ms: Math.round(performance.now() - t0), timestamp: new Date(), shopping_options: [{ title: `Procurement failed: ${reason}`, url: '', source: 'BuildSheet' }] };
  }
}
