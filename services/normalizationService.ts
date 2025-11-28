import { v4 as uuidv4 } from 'uuid';
import { 
  RawListing, 
  PropertyListing, 
  NormalizedStage, 
  RiskBand,
  Address
} from '../types';

/**
 * Normalization Service
 * 
 * Responsible for transforming raw, unstructured scraper data into the 
 * canonical PropertyListing schema. This ensures all downstream components
 * (UI, AI, Alerts) operate on clean, typed data.
 */

// --- Helper Functions ---

/**
 * Cleans money strings into numbers.
 * Handles "$123,456.00", "123456", and "N/A".
 */
export function cleanMoney(input: string | number | null): number | null {
  if (input === null || input === undefined) return null;
  const str = input.toString().trim();
  
  if (str === '' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'tbd') {
    return null;
  }

  // Remove currency symbols, commas, and whitespace
  const cleanStr = str.replace(/[$,\s]/g, '');
  const val = parseFloat(cleanStr);
  
  return isNaN(val) ? null : val;
}

/**
 * Parses diverse date formats into an ISO 8601 string.
 * Returns null for status-like date strings (e.g., "Adjourned").
 */
export function parseDate(input: string | null): string | null {
  if (!input) return null;
  
  const lower = input.toLowerCase().trim();
  
  // Filter out non-date status words often found in scraper date columns
  const invalidKeywords = ['adjourned', 'postponed', 'cancelled', 'tbd', 'n/a', 'set for sale'];
  if (invalidKeywords.some(k => lower.includes(k))) {
    return null;
  }
  
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    return null;
  }
  
  return d.toISOString();
}

/**
 * Generates a deterministic deduplication key based on address.
 * Key = lowercase(alphanumeric(street + city + zip))
 */
export function computeDedupKey(address: { street: string, city: string, zip: string }): string {
  const raw = `${address.street}${address.city}${address.zip}`;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Infers the normalized foreclosure stage based on explicit hints and status text.
 */
export function normalizeStage(hint: string | null, statusRaw: string): NormalizedStage {
  // Combine hint and status for keyword searching
  const text = ((hint || '') + ' ' + (statusRaw || '')).toLowerCase();
  
  if (text.includes('reo') || text.includes('bank owned') || text.includes('resale')) {
    return NormalizedStage.REO;
  }
  
  if (text.includes('auction') || text.includes('trustee') || text.includes('bid4assets') || text.includes('xome')) {
    return NormalizedStage.AUCTION;
  }
  
  if (text.includes('sheriff') || text.includes('scheduled') || text.includes('set for sale') || text.includes('adjourned')) {
    return NormalizedStage.SHERIFF_SALE;
  }
  
  if (text.includes('lis pendens') || text.includes('nod') || text.includes('pre-foreclosure')) {
    return NormalizedStage.PRE_FORECLOSURE;
  }
  
  return NormalizedStage.UNKNOWN;
}

/**
 * Parses a raw address string into structured components.
 * Assumes standard format: "Street, City, State Zip" or "Street, City, Zip"
 */
function parseRawAddress(rawAddress: string): Address {
  const parts = rawAddress.split(',').map(s => s.trim());
  
  // Default values
  let street = 'Unknown Street';
  let city = 'Unknown City';
  let zip = '00000';
  
  if (parts.length >= 1) street = parts[0];
  if (parts.length >= 2) city = parts[1];
  
  // Try to extract Zip from the last meaningful part
  const lastPart = parts[parts.length - 1] || '';
  const zipMatch = lastPart.match(/\b\d{5}\b/);
  
  if (zipMatch) {
    zip = zipMatch[0];
  } else if (parts.length > 2) {
      // Fallback: check second to last part if state is separate
      const secondLast = parts[parts.length - 2] || '';
      const zipMatchAlt = secondLast.match(/\b\d{5}\b/);
      if (zipMatchAlt) zip = zipMatchAlt[0];
  }

  return {
    full: rawAddress,
    street,
    city,
    county: "Unknown", // Requires geo-lookup map in production
    state: "NJ", // Hardcoded per requirements
    zip
  };
}

/**
 * Calculates financial metrics based on available values.
 */
function calculateValuation(estValue: number | null, openingBid: number | null) {
  let equityAmount: number | null = null;
  let equityPct: number | null = null;

  if (estValue !== null && estValue > 0 && openingBid !== null) {
    equityAmount = estValue - openingBid;
    equityPct = (equityAmount / estValue) * 100;
  }

  return { equityAmount, equityPct };
}

/**
 * Determines initial risk band using heuristic rules (Pre-AI).
 */
function determineHeuristicRisk(equityPct: number | null, saleDate: string | null): RiskBand {
  if (equityPct === null) return RiskBand.UNKNOWN;
  
  // Logic from Rules Spec
  // Hot: equity >= 25
  if (equityPct >= 25) return RiskBand.LOW;
  
  // Watchlist: equity 10-25
  if (equityPct >= 10) return RiskBand.MODERATE;
  
  // Archive/High Risk: equity < 10
  return RiskBand.HIGH;
}

// --- Main Export ---

/**
 * Main pipeline function to convert a RawListing to a PropertyListing.
 */
export function normalizeRawListing(raw: RawListing): PropertyListing {
  // 1. Address Normalization
  const addressObj = parseRawAddress(raw.raw_address);

  // 2. Financial Normalization
  const openingBid = cleanMoney(raw.raw_opening_bid);
  const estimatedValue = cleanMoney(raw.raw_estimated_value);
  const { equityAmount, equityPct } = calculateValuation(estimatedValue, openingBid);

  // 3. Stage & Status Normalization
  const stage = normalizeStage(raw.raw_stage_hint, raw.raw_status_text);
  const saleDate = parseDate(raw.raw_sale_date);

  // 4. Heuristic Risk Analysis
  const riskBand = determineHeuristicRisk(equityPct, saleDate);

  // 5. Audit Metadata
  const dedupeKey = computeDedupKey(addressObj);
  const now = new Date().toISOString();

  // 6. Construct Final Object
  return {
    id: uuidv4(), // Unique ID for app tracking
    address: addressObj,
    source: {
      source_type: raw.source_type,
      source_name: (raw.debug_metadata?.adapter_id as string) || 'Unknown Source',
      source_url: raw.raw_detail_url
    },
    foreclosure: {
      stage: stage,
      status: raw.raw_status_text || 'Unknown',
      sale_date: saleDate,
      opening_bid: openingBid,
      judgment_amount: null, // Usually not available in basic scrapers
      plaintiff: raw.raw_plaintiff,
      defendant: raw.raw_defendant,
      owner_phone: null // Requires skip tracing API
    },
    valuation: {
      estimated_value: estimatedValue,
      equity_amount: equityAmount,
      equity_pct: equityPct
    },
    ai_analysis: {
      ai_score: null, // Placeholder for async AI worker
      risk_band: riskBand,
      ai_summary: null,
      rationale: null
    },
    audit: {
      ingestion_timestamp: now,
      last_updated: now,
      dedupe_key: dedupeKey
    },
    occupancy: "Unknown", // Default until enriched
    notes: ""
  };
}