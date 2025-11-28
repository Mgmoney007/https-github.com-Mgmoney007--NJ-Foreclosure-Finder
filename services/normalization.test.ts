
// Fix: Declare test globals to avoid TS errors when @types/jest or @types/mocha are missing
declare var describe: any;
declare var test: any;
declare var expect: any;

import { 
  cleanMoney, 
  parseDate, 
  normalizeStage, 
  normalizeRawListing,
  computeDedupKey
} from './normalizationService';
import { NormalizedStage, RiskBand, RawListing } from '../types';
import { NORMALIZATION_VECTORS } from './normalization.fixtures';

describe('Normalization Service', () => {

  // --- 1. Financial Parsing ---
  describe('cleanMoney()', () => {
    test('parses standard currency strings', () => {
      expect(cleanMoney('$123,456.00')).toBe(123456);
      expect(cleanMoney('$500')).toBe(500);
      expect(cleanMoney('1,200')).toBe(1200);
    });

    test('handles valid non-currency strings', () => {
      expect(cleanMoney('450000')).toBe(450000);
    });

    test('returns null for invalid or placeholder values', () => {
      expect(cleanMoney('N/A')).toBeNull();
      expect(cleanMoney('TBD')).toBeNull();
      expect(cleanMoney('')).toBeNull();
      expect(cleanMoney(null)).toBeNull();
    });
  });

  // --- 2. Date Normalization ---
  describe('parseDate()', () => {
    test('converts valid date strings to ISO format', () => {
      const result = parseDate('2024-10-15');
      expect(result).toContain('2024-10-15');
    });

    test('converts verbose date strings', () => {
      // Assuming scraper might return "Oct 15, 2024"
      const result = parseDate('Oct 15, 2024');
      expect(result).not.toBeNull();
      if (result) expect(new Date(result).getFullYear()).toBe(2024);
    });

    test('returns null for status text disguised as dates', () => {
      expect(parseDate('Adjourned')).toBeNull();
      expect(parseDate('Set for Sale')).toBeNull();
      expect(parseDate('Cancelled')).toBeNull();
    });

    test('returns null for empty input', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate('')).toBeNull();
    });
  });

  // --- 3. Stage Inference ---
  describe('normalizeStage()', () => {
    test('detects Sheriff Sales', () => {
      expect(normalizeStage('Sheriff Sale', 'Scheduled')).toBe(NormalizedStage.SHERIFF_SALE);
      expect(normalizeStage(null, 'Set for Sale')).toBe(NormalizedStage.SHERIFF_SALE);
    });

    test('detects REO/Bank Owned', () => {
      expect(normalizeStage('REO', 'Active')).toBe(NormalizedStage.REO);
      expect(normalizeStage(null, 'Bank Owned')).toBe(NormalizedStage.REO);
    });

    test('detects Auctions', () => {
      expect(normalizeStage('Trustee Sale', '')).toBe(NormalizedStage.AUCTION);
      expect(normalizeStage('Auction', 'Online')).toBe(NormalizedStage.AUCTION);
    });

    test('detects Pre-Foreclosure', () => {
      expect(normalizeStage(null, 'Lis Pendens Filed')).toBe(NormalizedStage.PRE_FORECLOSURE);
      expect(normalizeStage(null, 'NOD')).toBe(NormalizedStage.PRE_FORECLOSURE);
    });

    test('defaults to Unknown', () => {
      expect(normalizeStage(null, 'Random Text')).toBe(NormalizedStage.UNKNOWN);
    });
  });

  // --- 4. Deduplication Keys ---
  describe('computeDedupKey()', () => {
    test('generates consistent keys ignoring case and format', () => {
      const addr1 = { street: '123 Main St', city: 'Hoboken', zip: '07030' };
      const addr2 = { street: '123 main st', city: 'hoboken', zip: '07030' };
      expect(computeDedupKey(addr1)).toBe(computeDedupKey(addr2));
    });
    
    test('removes spaces and special chars', () => {
      const addr = { street: '123 Main St.', city: 'Hoboken', zip: '07030' };
      // Expected: "123mainst.hoboken07030" normalized -> "123mainsthoboken07030"
      expect(computeDedupKey(addr)).toMatch(/^[a-z0-9]+$/);
    });
  });

  // --- 5. Data QA Vector Suite ---
  describe('Data QA Vectors (Integration Tests)', () => {
    NORMALIZATION_VECTORS.forEach(vector => {
      test(`[${vector.name}] normalizes correctly`, () => {
        const result = normalizeRawListing(vector.input);

        // Address
        expect(result.address.city).toBe(vector.expected.address.city);
        expect(result.address.zip).toBe(vector.expected.address.zip);
        // Loose check for street to handle whitespace normalization differences if any
        expect(result.address.street.replace(/\s+/g, ' ')).toContain(vector.expected.address.street.replace(/\s+/g, ' '));

        // Financials
        expect(result.valuation.estimated_value).toBe(vector.expected.financials.estimated_value);
        expect(result.foreclosure.opening_bid).toBe(vector.expected.financials.opening_bid);
        if (vector.expected.financials.equity_pct !== null) {
             expect(result.valuation.equity_pct).toBeCloseTo(vector.expected.financials.equity_pct, 1);
        } else {
             expect(result.valuation.equity_pct).toBeNull();
        }

        // Foreclosure Details
        expect(result.foreclosure.stage).toBe(vector.expected.foreclosure.stage);
        
        // Date Check (handling ISO string comparison)
        if (vector.expected.foreclosure.sale_date) {
            // Compare YYYY-MM-DD parts to avoid timezone flake in tests
            expect(result.foreclosure.sale_date?.split('T')[0]).toBe(vector.expected.foreclosure.sale_date.split('T')[0]);
        } else {
            expect(result.foreclosure.sale_date).toBeNull();
        }

        // Risk Band
        expect(result.ai_analysis.risk_band).toBe(vector.expected.risk.risk_band);
      });
    });
  });

});
