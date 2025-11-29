
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
  source_reliability: number | null; // New field for trustworthiness (0-1, 1 being most reliable)
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
  // New assessor data fields
  lot_size_sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
  property_type?: string | null;
}

// SavedSearch now aligned with NormalizedSearchParams
export interface SavedSearch {
  id: string;
  name: string;
  filters: {
    zip?: string;
    city?: string;
    county?: string;
    propertyTypes?: string[];
    minPrice?: number;
    maxPrice?: number;
    stages?: NormalizedStage[];

    // Geographical Search
    latitude?: number;
    longitude?: number;
    radius_miles?: number;

    // Assessor Data Filters
    min_lot_size_sqft?: number;
    max_lot_size_sqft?: number;
    min_beds?: number;
    max_beds?: number;
    min_baths?: number;
    max_baths?: number;
    property_types?: string[];


    // legacy / extra filters still allowed
    min_equity_pct?: number;
    max_price?: number;
    cities?: string[];
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
  // New Assessor Data
  "Beds"?: string;
  "Baths"?: string;
  "Lot Size Sqft"?: string;
  "Property Type"?: string;
}

// --- Pipeline & Repository Interfaces ---

// Extended to include useful counters
export interface AdapterIngestionSummary {
  adapterId: string;
  rawCount: number;
  normalizedCount: number;
  createdCount: number;
  updatedCount: number;
  itemsSkippedNormalization: number;
  itemsFailedProcessing: number;
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
  /**
   * Convert RawListing into a normalized PropertyListing.
   * Return null to skip obviously bad/irrelevant records.
   */
  normalizeRawListing(raw: RawListing): PropertyListing | null;

  /**
   * Deterministic dedupe key from address components.
   */
  computeDedupKey(address: { street: string; city: string; zip: string }): string;
}

export interface AIService {
  /**
   * Enrich an already-normalized PropertyListing with AI fields (ai_analysis),
   * without breaking audit/address/source invariants.
   */
  enrichListing(listing: PropertyListing): Promise<PropertyListing>;
}

// --- Data Events & Timeline History ---

export enum EventType {
  LIS_PENDENS_FILED = "LIS_PENDENS_FILED",
  FINAL_JUDGMENT = "FINAL_JUDGMENT",
  SHERIFF_SALE_SCHEDULED = "SHERIFF_SALE_SCHEDULED",
  SHERIFF_SALE_ADJOURNED = "SHERIFF_SALE_ADJOURNED",
  AUCTION_LISTED = "AUCTION_LISTED",
  PRICE_CHANGE = "PRICE_CHANGE",
  SOLD_TO_PLAINTIFF = "SOLD_TO_PLAINTIFF",
  SOLD_TO_THIRD_PARTY = "SOLD_TO_THIRD_PARTY",
  LISTING_REMOVED = "LISTING_REMOVED",
}

export interface TimelineEvent {
  id: string;
  date: string; // ISO 8601
  type: EventType;
  source: string; // "CivilView", "County Records", "User Input"
  description: string; // Human readable summary
  metadata: Record<string, any>; // Flexible payload based on type
}
