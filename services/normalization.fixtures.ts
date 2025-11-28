
import { RawListing, NormalizedStage, RiskBand } from '../types';

/**
 * Data QA Test Vectors
 * 
 * Each vector contains:
 * 1. input: A raw listing representing a specific source or data quality scenario.
 * 2. expected: The subset of the PropertyListing we expect to be normalized deterministically.
 */

export const NORMALIZATION_VECTORS = [
  {
    name: "Happy Path: Standard Sheriff Sale (SalesWeb)",
    input: {
      raw_address: "100 Garden State Pkwy, Woodbridge, NJ 07095",
      raw_status_text: "Scheduled",
      raw_stage_hint: "Sheriff Sale",
      raw_sale_date: "2024-12-25",
      raw_opening_bid: "$150,000.00",
      raw_estimated_value: "$300,000", // 50% Equity
      raw_plaintiff: "US Bank Trust",
      raw_defendant: "James T. Kirk",
      raw_detail_url: "https://salesweb.civilview.com/details/123",
      source_type: "Scraper"
    } as RawListing,
    expected: {
      address: { street: "100 Garden State Pkwy", city: "Woodbridge", zip: "07095" },
      financials: { estimated_value: 300000, opening_bid: 150000, equity_pct: 50 },
      foreclosure: { stage: NormalizedStage.SHERIFF_SALE, sale_date: "2024-12-25T00:00:00.000Z" },
      risk: { risk_band: RiskBand.LOW }
    }
  },
  {
    name: "Edge Case: Adjourned Status & Messy Date",
    input: {
      raw_address: "55 Broken Blvd, Newark, NJ 07102",
      raw_status_text: "Adjourned",
      raw_stage_hint: null,
      raw_sale_date: "Adjourned to 1/15", // Should parse to NULL or handle gracefully
      raw_opening_bid: "N/A",
      raw_estimated_value: "250000", 
      raw_plaintiff: "Wells Fargo",
      raw_defendant: "Unknown Heirs",
      raw_detail_url: "",
      source_type: "Excel"
    } as RawListing,
    expected: {
      address: { street: "55 Broken Blvd", city: "Newark", zip: "07102" },
      financials: { estimated_value: 250000, opening_bid: null, equity_pct: null },
      foreclosure: { stage: NormalizedStage.SHERIFF_SALE, sale_date: null },
      risk: { risk_band: RiskBand.UNKNOWN }
    }
  },
  {
    name: "Scenario: Underwater/High Risk Asset",
    input: {
      raw_address: "99 Underwater Ln, Atlantic City, NJ 08401",
      raw_status_text: "Active",
      raw_stage_hint: "REO",
      raw_sale_date: "2024-11-01",
      raw_opening_bid: "$220,000",
      raw_estimated_value: "$200,000", // Negative Equity
      raw_plaintiff: "Casino Reinvestment Auth",
      raw_defendant: "LLC Holdings",
      raw_detail_url: "",
      source_type: "Manual"
    } as RawListing,
    expected: {
      address: { street: "99 Underwater Ln", city: "Atlantic City", zip: "08401" },
      financials: { estimated_value: 200000, opening_bid: 220000, equity_pct: -10 },
      foreclosure: { stage: NormalizedStage.REO, sale_date: "2024-11-01T00:00:00.000Z" },
      risk: { risk_band: RiskBand.HIGH }
    }
  },
  {
    name: "Data QA: Messy Address & Money Formats",
    input: {
      raw_address: "777  Messy   Road ,   Clifton  , NJ 07013 ", // Extra spaces
      raw_status_text: "Lis Pendens Filed",
      raw_stage_hint: "Pre-Foreclosure",
      raw_sale_date: "TBD",
      raw_opening_bid: "$ 120,000.50 ", // Space after $
      raw_estimated_value: "400000",
      raw_plaintiff: null,
      raw_defendant: null,
      raw_detail_url: "",
      source_type: "Scraper"
    } as RawListing,
    expected: {
      address: { street: "777 Messy Road", city: "Clifton", zip: "07013" },
      financials: { estimated_value: 400000, opening_bid: 120000.50, equity_pct: 69.999875 }, // Approx 70%
      foreclosure: { stage: NormalizedStage.PRE_FORECLOSURE, sale_date: null },
      risk: { risk_band: RiskBand.LOW }
    }
  }
];
