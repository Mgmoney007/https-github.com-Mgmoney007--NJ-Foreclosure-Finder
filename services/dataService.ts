
import { PropertyListing, RawCSVRow, NormalizedStage, RiskBand } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalization Utilities
 */
const cleanMoney = (str: string): number | null => {
  if (!str || str === 'N/A') return null;
  const cleaned = str.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

const normalizeStage = (rawStage: string, rawStatus: string): NormalizedStage => {
  const combined = (rawStage + " " + rawStatus).toLowerCase();
  
  if (combined.includes('nod') || combined.includes('lis pendens')) return NormalizedStage.PRE_FORECLOSURE;
  if (combined.includes('sheriff')) return NormalizedStage.SHERIFF_SALE;
  if (combined.includes('auction') || combined.includes('trustee')) return NormalizedStage.AUCTION;
  if (combined.includes('reo') || combined.includes('bank-owned')) return NormalizedStage.REO;
  
  return NormalizedStage.UNKNOWN;
};

const getMockCoordinates = (city: string, street: string): { lat: number, lng: number } => {
  // Approximate centers for NJ cities to simulate geocoding
  // Added small random jitter to separate pins
  const jitter = () => (Math.random() - 0.5) * 0.01;
  
  const baseCoords: Record<string, { lat: number, lng: number }> = {
    "Jersey City": { lat: 40.7178, lng: -74.0431 },
    "Hoboken": { lat: 40.7440, lng: -74.0324 },
    "Weehawken": { lat: 40.7695, lng: -74.0185 },
    "Cherry Hill": { lat: 39.9268, lng: -75.0246 },
    "Atlantic City": { lat: 39.3643, lng: -74.4229 },
    "Newark": { lat: 40.7357, lng: -74.1724 },
  };

  const cityKey = Object.keys(baseCoords).find(k => city.toLowerCase().includes(k.toLowerCase()));
  const center = cityKey ? baseCoords[cityKey] : { lat: 40.0583, lng: -74.4057 }; // Default to central NJ

  return {
    lat: center.lat + jitter(),
    lng: center.lng + jitter()
  };
};

const parseAddress = (fullAddress: string) => {
  // Simple regex parser for "Street, City, NJ Zip" format
  // In a real app, use a library like 'parse-address'
  const parts = fullAddress.split(',').map(s => s.trim());
  let street = parts[0] || "";
  let city = parts[1] || "";
  let zip = "";
  let state: "NJ" = "NJ";

  if (parts.length > 2) {
    const stateZip = parts[2].split(' ');
    zip = stateZip[stateZip.length - 1];
  }

  const coords = getMockCoordinates(city, street);

  return { 
    full: fullAddress, 
    street, 
    city, 
    state, 
    zip, 
    county: "Hudson", // Defaulting county for demo
    lat: coords.lat,
    lng: coords.lng
  }; 
};

const calculateMetrics = (estValue: number | null, openingBid: number | null) => {
  if (!estValue || !openingBid) return { equity_amount: null, equity_pct: null };
  const equity_amount = estValue - openingBid;
  const equity_pct = (equity_amount / estValue) * 100;
  return { equity_amount, equity_pct };
};

const determineRiskBand = (equityPct: number | null, stage: NormalizedStage): RiskBand => {
  if (equityPct === null) return RiskBand.UNKNOWN;
  if (equityPct < 10) return RiskBand.HIGH;
  if (equityPct < 25) return RiskBand.MODERATE;
  return RiskBand.LOW; // High equity = Low Risk for investor
};

/**
 * Ingestion Engine
 * Converts Raw CSV rows into Unified Schema
 */
export const ingestCSVData = (csvContent: string): PropertyListing[] => {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  // Parsing simple CSV (ignoring complex quote handling for brevity in this demo, 
  // but accounting for the specific quote style in constants)
  const dataRows = lines.slice(1).map(line => {
    const regex = /"(.*?)"|([^,]+)/g;
    const matches = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
        matches.push(match[1] || match[2]);
    }
    return matches;
  });

  return dataRows.map(row => {
    // Map array to object based on index (assuming fixed structure for demo)
    // 0: Address, 3: Status, 4: Stage, 5: Date, 6: Bid, 7: Value, 8: URL, 9: Occ, 10: Notes
    const raw: Partial<RawCSVRow> = {
      Address: row[0],
      "Phone Number": row[1],
      "Home Owner": row[2],
      Status: row[3],
      Stage: row[4],
      "Auction Date": row[5],
      "Opening Bid": row[6],
      "Est. Value": row[7],
      "Source URL": row[8],
      Occupancy: row[9],
      "Notes / Flags": row[10]
    };

    const address = parseAddress(raw.Address || "");
    const openingBid = cleanMoney(raw["Opening Bid"] || "");
    const estValue = cleanMoney(raw["Est. Value"] || "");
    const { equity_amount, equity_pct } = calculateMetrics(estValue, openingBid);
    const stage = normalizeStage(raw.Stage || "", raw.Status || "");
    const riskBand = determineRiskBand(equity_pct, stage);

    // Mocking AI Score for demo purposes (Rule-based approximation)
    let aiScore = 50;
    if (equity_pct && equity_pct > 30) aiScore += 30;
    if (raw.Occupancy === 'Vacant') aiScore += 10;
    if (stage === NormalizedStage.REO) aiScore -= 10;

    return {
      id: uuidv4(),
      address: address,
      source: {
        source_type: "Manual Import",
        source_name: "Excel Tracker",
        source_url: raw["Source URL"] || ""
      },
      foreclosure: {
        stage: stage,
        status: raw.Status || "Unknown",
        sale_date: raw["Auction Date"] !== 'N/A' ? raw["Auction Date"] || null : null,
        opening_bid: openingBid,
        judgment_amount: null,
        plaintiff: null,
        defendant: raw["Home Owner"] || null,
        owner_phone: raw["Phone Number"] || null
      },
      valuation: {
        estimated_value: estValue,
        equity_amount,
        equity_pct
      },
      ai_analysis: {
        ai_score: Math.min(Math.max(aiScore, 0), 100),
        risk_band: riskBand,
        ai_summary: `AI calculated ${riskBand} risk based on ${equity_pct?.toFixed(1)}% equity spread.`,
        rationale: "Automated preliminary scoring based on valuation spread and occupancy status."
      },
      audit: {
        ingestion_timestamp: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        dedupe_key: (address.street + address.city + address.zip).toLowerCase().replace(/\s/g, '')
      },
      occupancy: raw.Occupancy || "Unknown",
      notes: raw["Notes / Flags"] || ""
    };
  });
};
