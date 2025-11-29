
import { v4 as uuidv4 } from "uuid";
import {
  RawListing,
  PropertyListing,
  NormalizedStage,
  RiskBand,
  Address,
  NormalizationService as INormalizationService
} from "../types";
import { SOURCE_RELIABILITY_SCORES } from "../constants";

/**
 * Normalization Service
 * 
 * Converts RawListing into the canonical PropertyListing shape.
 * Does NOT set audit timestamps or AI fields — the pipeline and AIService handle that.
 */

// --- Helper Functions ---

export function cleanMoney(input: string | number | null): number | null {
  if (input === null || input === undefined) return null;

  const str = input.toString().trim();
  if (str === "" || str.toLowerCase() === "n/a" || str.toLowerCase() === "tbd") {
    return null;
  }

  const cleanStr = str.replace(/[$,\s]/g, "");
  const val = parseFloat(cleanStr);

  return isNaN(val) ? null : val;
}

export function parseDate(input: string | null): string | null {
  if (!input) return null;

  const lower = input.toLowerCase().trim();
  const invalidKeywords = ["adjourned", "postponed", "cancelled", "tbd", "n/a", "set for sale"];
  if (invalidKeywords.some(k => lower.includes(k))) return null;

  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function computeDedupKey(address: { street: string; city: string; zip: string }): string {
  const raw = `${address.street}${address.city}${address.zip}`;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeStage(hint: string | null, statusRaw: string): NormalizedStage {
  const text = ((hint || "") + " " + (statusRaw || "")).toLowerCase();

  if (text.includes("reo") || text.includes("bank owned")) return NormalizedStage.REO;
  if (text.includes("auction") || text.includes("trustee") || text.includes("xome"))
    return NormalizedStage.AUCTION;
  if (text.includes("sheriff") || text.includes("scheduled") || text.includes("adjourned"))
    return NormalizedStage.SHERIFF_SALE;
  if (text.includes("lis pendens") || text.includes("pre-foreclosure"))
    return NormalizedStage.PRE_FORECLOSURE;

  return NormalizedStage.UNKNOWN;
}

function parseRawAddress(rawAddress: string): Address {
  const parts = rawAddress.split(",").map(s => s.trim());

  let street = "Unknown Street";
  let city = "Unknown City";
  let zip = "00000";

  if (parts.length >= 1) street = parts[0];
  if (parts.length >= 2) city = parts[1];

  const lastPart = parts[parts.length - 1] ?? "";
  const zipMatch = lastPart.match(/\b\d{5}\b/);
  if (zipMatch) {
    zip = zipMatch[0];
  }

  return {
    full: rawAddress,
    street,
    city,
    county: "Unknown",
    state: "NJ",
    zip
  };
}

function calculateValuation(
  estValue: number | null,
  openingBid: number | null
): { equityAmount: number | null; equityPct: number | null } {
  if (estValue !== null && estValue > 0 && openingBid !== null) {
    const equityAmount = estValue - openingBid;
    const equityPct = (equityAmount / estValue) * 100;
    return { equityAmount, equityPct };
  }
  return { equityAmount: null, equityPct: null };
}

function determineHeuristicRisk(equityPct: number | null): RiskBand {
  if (equityPct === null) return RiskBand.UNKNOWN;
  if (equityPct >= 25) return RiskBand.LOW;
  if (equityPct >= 10) return RiskBand.MODERATE;
  return RiskBand.HIGH;
}

function getSourceReliability(raw: RawListing): number | null {
  const sourceTypeKey = raw.source_type;
  const adapterIdKey = raw.debug_metadata?.adapter_id;

  // Prioritize adapter-specific reliability if available
  if (adapterIdKey) {
    const specificKey = `${sourceTypeKey}:${adapterIdKey}`;
    if (SOURCE_RELIABILITY_SCORES[specificKey]) {
      return SOURCE_RELIABILITY_SCORES[specificKey];
    }
  }

  // Fallback to general source type reliability
  if (SOURCE_RELIABILITY_SCORES[sourceTypeKey]) {
    return SOURCE_RELIABILITY_SCORES[sourceTypeKey];
  }

  // Default to unknown source reliability
  return SOURCE_RELIABILITY_SCORES["Unknown Source"] || null;
}

// --- Main Normalization Implementation ---

export function normalizeRawListing(raw: RawListing): PropertyListing | null {
  try {
    // 1. Address
    const addressObj = parseRawAddress(raw.raw_address);

    // 2. Financial normalization
    const openingBid = cleanMoney(raw.raw_opening_bid);
    const estimatedValue = cleanMoney(raw.raw_estimated_value);
    const { equityAmount, equityPct } = calculateValuation(estimatedValue, openingBid);

    // 3. Stage & Status
    const stage = normalizeStage(raw.raw_stage_hint, raw.raw_status_text);
    const saleDate = parseDate(raw.raw_sale_date);

    // 4. Pre-AI heuristic risk (AIService will override)
    const riskBand = determineHeuristicRisk(equityPct);

    // 5. Dedupe key — DO NOT stamp audit timestamps here
    const dedupeKey = computeDedupKey({
      street: addressObj.street,
      city: addressObj.city,
      zip: addressObj.zip
    });

    // 6. Determine source reliability
    const sourceReliability = getSourceReliability(raw);

    // 7. Construct normalized listing (audit timestamps filled in pipeline)
    const now = new Date().toISOString();

    return {
      id: uuidv4(),

      address: addressObj,

      source: {
        source_type: raw.source_type,
        source_name: raw.debug_metadata?.adapter_id || "Unknown Source",
        source_url: raw.raw_detail_url,
        source_reliability: sourceReliability,
      },

      foreclosure: {
        stage,
        status: raw.raw_status_text || "Unknown",
        sale_date: saleDate,
        opening_bid: openingBid,
        judgment_amount: null,
        plaintiff: raw.raw_plaintiff,
        defendant: raw.raw_defendant,
        owner_phone: null
      },

      valuation: {
        estimated_value: estimatedValue,
        equity_amount: equityAmount,
        equity_pct: equityPct
      },

      ai_analysis: {
        ai_score: null,
        risk_band: riskBand,
        ai_summary: null,
        rationale: null
      },

      audit: {
        ingestion_timestamp: now, // pipeline may override for updates
        last_updated: now,
        dedupe_key: dedupeKey
      },

      occupancy: "Unknown",
      notes: ""
    };
  } catch (err) {
    console.error("Normalization error:", err);
    return null;
  }
}

export class NormalizationService implements INormalizationService {
  normalizeRawListing(raw: RawListing): PropertyListing | null {
    return normalizeRawListing(raw);
  }

  computeDedupKey(address: { street: string; city: string; zip: string }): string {
    return computeDedupKey(address);
  }
}
