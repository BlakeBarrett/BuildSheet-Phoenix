/**
 * Types for the Verified Procurement Engine.
 * Implements the "Verify-Before-Display" protocol with multi-stage pipeline,
 * price anomaly detection, and geopolitical logistics risk assessment.
 */

// --- Pipeline Stage Types ---

export enum ProcurementStatus {
  VERIFIED = 'VERIFIED',
  SUSPECT = 'SUSPECT',
  UNVERIFIED = 'UNVERIFIED',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  ERROR = 'ERROR',
}

export interface DiscoveryResult {
  url: string;
  title: string;
  source: string;
  thumbnail?: string;
}

export interface ExtractedPageData {
  url: string;
  markdown: string;
  extractedAt: Date;
  thumbnail?: string;
}

export interface VerifiedPartData {
  price: number | null;
  stock_status: 'in_stock' | 'out_of_stock' | 'limited' | 'backorder' | 'unknown';
  shipping_location: string | null;
  last_updated_date: string | null;
  source_url: string;
  source_name: string;
  confidence: number;
  thumbnail?: string;
}

// --- Risk & Anomaly Types ---

export interface PriceAnomaly {
  detected: boolean;
  found_price: number;
  rolling_avg_7d: number;
  deviation_pct: number;
  category: string;
  fourth_source_verified: boolean;
  fourth_source_url?: string;
}

export type RiskFlag =
  | 'PRICE_ANOMALY'
  | 'LOGISTICS_DELAY_HORMUZ'
  | 'LOGISTICS_DELAY_RED_SEA'
  | 'ALL_SOURCES_OOS'
  | 'LOW_CONFIDENCE'
  | 'SINGLE_SOURCE_ONLY';

export interface LogisticsRisk {
  zone: string;
  delay_estimate_days: number;
  shipping_location: string;
}

// --- Geopolitical Risk Map ---

export interface BufferZone {
  name: string;
  keywords: string[];
  default_delay_days: number;
}

export const GEOPOL_RISK_MAP: BufferZone[] = [
  {
    name: 'Hormuz Strait',
    keywords: ['iran', 'oman', 'uae', 'bahrain', 'qatar', 'strait of hormuz', 'bandar abbas', 'fujairah', 'khor fakkan'],
    default_delay_days: 21,
  },
  {
    name: 'Red Sea',
    keywords: ['yemen', 'djibouti', 'eritrea', 'bab el-mandeb', 'red sea', 'jeddah', 'port sudan', 'aden', 'hodeidah', 'massawa'],
    default_delay_days: 21,
  },
  {
    name: 'Taiwan Strait',
    keywords: ['taiwan strait', 'kaohsiung', 'keelung', 'taichung port'],
    default_delay_days: 14,
  },
  {
    name: 'South China Sea',
    keywords: ['south china sea', 'spratly', 'paracel', 'scarborough shoal'],
    default_delay_days: 10,
  },
];

// --- Category Rolling Averages (placeholder store) ---

export interface CategoryPriceHistory {
  category: string;
  rolling_avg_7d: number;
  sample_count: number;
  last_updated: Date;
}

// Default category baselines used when no history exists
export const DEFAULT_CATEGORY_BASELINES: Record<string, number> = {
  'DDR5 RAM': 85,
  'DDR4 RAM': 35,
  'SSD': 60,
  'NVMe SSD': 80,
  'GPU': 450,
  'CPU': 280,
  'Motherboard': 180,
  'PSU': 90,
  'HDD': 45,
  'RAM': 60,
};

// --- Main Result Type ---

export interface ProcurementResult {
  query: string;
  status: ProcurementStatus;
  confidence_score: number;
  verified_sources_count: number;
  risk_flags: RiskFlag[];

  // Best verified data across sources
  best_price: number | null;
  best_source: VerifiedPartData | null;
  all_sources: VerifiedPartData[];

  // Anomaly detection
  price_anomaly: PriceAnomaly | null;

  // Logistics risks
  logistics_risks: LogisticsRisk[];
  logistics_delay_estimate_days: number;

  // Metadata
  pipeline_duration_ms: number;
  timestamp: Date;

  // Fallback: raw shopping options for backwards compatibility
  shopping_options: import('../types.ts').ShoppingOption[];
}

// --- Engine Configuration ---

export type VerificationBackend = 'gemini' | 'local';

export interface ProcurementEngineConfig {
  searxng_base_url: string;
  firecrawl_api_key?: string;
  firecrawl_base_url: string;
  anomaly_threshold_pct: number;     // Default: 50 — flag if price is >50% below rolling avg
  max_discovery_results: number;     // Default: 5
  verification_timeout_ms: number;   // Default: 15000
  enable_logistics_risk: boolean;    // Default: true
  /** Which LLM backend to use for Stage 3 verification. Defaults to 'gemini'. */
  verification_backend: VerificationBackend;
}

export const DEFAULT_PROCUREMENT_CONFIG: ProcurementEngineConfig = {
  searxng_base_url: 'http://localhost:8888',
  firecrawl_base_url: 'http://localhost:3002',
  anomaly_threshold_pct: 50,
  max_discovery_results: 5,
  verification_timeout_ms: 15000,
  enable_logistics_risk: true,
  verification_backend: 'gemini',
};
