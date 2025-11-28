
// Canonical Unified Schema based on Knowledge Pack

export enum RiskBand {
  LOW = "Low",
  MODERATE = "Moderate",
  HIGH = "High",
  UNKNOWN = "Unknown"
}

export enum NormalizedStage {
  PRE_FORECLOSURE = "pre_foreclosure",
  SHERIFF_SALE = "sheriff_sale",
  AUCTION = "auction",
  REO = "reo",
  UNKNOWN = "unknown"
}

export interface Address {
  full: string;
  street: string;
  city: string;
  county: string;
  state: "NJ";
  zip: string;
  lat?: number;
  lng?: number;
}

export interface SourceInfo {
  source_type: string;
  source_name: string;
  source_url: string;
}

export interface ForeclosureDetails {
  stage: NormalizedStage | string;
  status: string; // Original status text
  sale_date: string | null; // ISO Date
  opening_bid: number | null;
  judgment_amount: number | null;
  plaintiff: string | null;
  defendant: string | null;
  owner_phone: string | null; // From Excel "Phone Number"
}

export interface Valuation {
  estimated_value: number | null;
  equity_amount: number | null;
  equity_pct: number | null;
}

export interface AIAnalysis {
  ai_score: number | null; // 0-100
  risk_band: RiskBand | string | null;
  ai_summary: string | null;
  rationale: string | null;
}

export interface Audit {
  ingestion_timestamp: string;
  last_updated: string;
  dedupe_key: string;
}

export interface PropertyListing {
  id: string;
  address: Address;
  source: SourceInfo;
  foreclosure: ForeclosureDetails;
  valuation: Valuation;
  ai_analysis: AIAnalysis;
  audit: Audit;
  occupancy: string;
  notes: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: {
    min_equity_pct?: number;
    max_price?: number;
    cities?: string[];
    stages?: NormalizedStage[];
  };
  alerts_enabled: boolean;
  created_at: string;
}

// --- Ingestion & Adapter Interfaces ---

/**
 * Represents the raw, unstructured data captured from a source (Web Scraper, API, or File)
 * before it passes through the Normalization Engine.
 */
export interface RawListing {
  raw_address: string;
  raw_status_text: string;
  raw_stage_hint: string | null; // e.g., "Sheriff Sale", "Bank Owned", "Trustee Sale"
  raw_sale_date: string | null; // Often unstructured, e.g., "Dec 12, 2024" or "Adjourned"
  raw_opening_bid: string | number | null;
  raw_estimated_value: string | number | null;
  raw_plaintiff: string | null;
  raw_defendant: string | null;
  raw_detail_url: string;
  source_type: string;
  
  // Optional metadata useful for debugging ingestion issues
  debug_metadata?: Record<string, any>;
}

/**
 * Standardized search parameters used to query different SourceAdapters.
 * This allows the system to fan-out a single user query to multiple disparate sources.
 */
export interface NormalizedSearchParams {
  zip?: string;
  city?: string;
  county?: string;
  propertyTypes?: string[];
  minPrice?: number;
  maxPrice?: number;
  stages?: NormalizedStage[];
  startDate?: string; // ISO Date string for range filtering
  endDate?: string;   // ISO Date string for range filtering
}

/**
 * The Contract for any data connector in the NJ Foreclosure Finder ecosystem.
 * Whether scraping a county website or reading an Excel file, the adapter must implement this.
 */
export interface SourceAdapter {
  id: string;
  label: string;
  
  /**
   * Determines if this adapter is capable of fetching data for a specific region.
   * @param state - Two-letter state code (e.g., "NJ")
   */
  supportsState(state: string): boolean;

  /**
   * The primary execution method. Converts normalized params into source-specific logic
   * (e.g., constructing a URL, filling a form, or parsing a file) and returns RawListings.
   * @param params - The search filters
   */
  search(params: NormalizedSearchParams): Promise<RawListing[]>;
}

// Raw Data Interface (Legacy/Specific for Excel Import)
export interface RawCSVRow {
  Address: string;
  "Phone Number": string;
  "Home Owner": string;
  Status: string;
  Stage: string;
  "Auction Date": string;
  "Opening Bid": string;
  "Est. Value": string;
  "Source URL": string;
  Occupancy: string;
  "Notes / Flags": string;
}

// --- Pipeline & Repository Interfaces ---

export interface AdapterIngestionSummary {
  adapterId: string;
  rawCount: number;
  normalizedCount: number;
  createdCount: number;
  updatedCount: number;
  error?: string;
}

export interface IngestionResult {
  savedSearchId: string;
  adapterSummaries: AdapterIngestionSummary[];
  startedAt: string;
  finishedAt: string;
}

export interface SavedSearchRepository {
  getById(id: string): Promise<SavedSearch | null>;
}

export interface PropertyRepository {
  findByDedupeKey(dedupeKey: string): Promise<PropertyListing | null>;
  insert(listing: PropertyListing): Promise<void>;
  updateById(id: string, listing: Partial<PropertyListing>): Promise<void>;
}

export interface NormalizationService {
  normalizeRawListing(raw: RawListing): PropertyListing;
  computeDedupKey(address: { street: string; city: string; zip: string }): string;
}

export interface AIService {
  enrichListing(listing: PropertyListing): Promise<PropertyListing>;
}
