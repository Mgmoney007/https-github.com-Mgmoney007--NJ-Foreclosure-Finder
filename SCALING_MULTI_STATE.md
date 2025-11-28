
# Architecture: Scaling from NJ to Multi-State

## 1. Core Challenge: Legal Workflow Divergence
The primary barrier to scaling is not data volume, but **Legal Process Variance**. 
*   **New Jersey (Current):** Judicial State. *Lis Pendens* -> *Final Judgment* -> *Sheriff Sale*. Timeline: 1-3 Years.
*   **Texas/Georgia:** Non-Judicial (Power of Sale). *Notice of Default* -> *Foreclosure Auction*. Timeline: < 60 Days.
*   **California:** Trustee System. *NOD* -> *NOTS* -> *Trustee Sale*.

**Solution:** Implement the **State Profile Pattern**. Logic should not be hardcoded; it should be injected based on the property's jurisdiction.

---

## 2. Schema Deltas

We must generalize the strict NJ types to accommodate other flows.

### A. Address Entity
**Current:**
```typescript
state: "NJ" // Hardcoded literal
```
**Future:**
```typescript
state: string; // ISO 2-letter code
county_fips: string; // Standardized FIPS code (e.g., 34017 for Hudson, NJ)
legal_description?: string; // Critical for states where address is ambiguous (e.g., rural TX)
```

### B. Foreclosure Details
**Current:**
```typescript
judgment_amount: number | null; // Specific to Judicial
```
**Future:**
```typescript
process_type: "JUDICIAL" | "NON_JUDICIAL" | "HYBRID";
debt_amount: number | null; // Generalized "Judgment" or "Total Debt"
redemption_period_days: number; // Critical for Tax Deeds or states like AL/MI
```

### C. Normalized Stages (Expanded Enum)
We need a superset of stages that map to the common lifecycle:
1.  **Start:** `PRE_FORECLOSURE` (Lis Pendens, NOD)
2.  **Warning:** `AUCTION_SCHEDULED` (Sheriff Sale, Trustee Sale, NOTICE_OF_SALE)
3.  **End:** `REO` (Bank Owned) or `SOLD_THIRD_PARTY`

---

## 3. The "State Profile" Configuration

Instead of `if (state === 'NJ')` spaghetti code, we define a config object per state.

```typescript
// config/stateProfiles.ts

interface StateProfile {
  code: string;
  processType: 'JUDICIAL' | 'NON_JUDICIAL';
  avgTimelineDays: number;
  
  // Mapping raw scraper text to Normalized Stages
  stageKeywords: {
    [key in NormalizedStage]: string[];
  };
  
  // Strategic Adjustments
  defaultStrategy: {
    minEquity: number; // FL might need 30% due to insurance costs
    timelineBonus: number; // TX is fast, so urgent_window is smaller (7 days)
  }
}

export const NJ_PROFILE: StateProfile = {
  code: 'NJ',
  processType: 'JUDICIAL',
  avgTimelineDays: 450,
  stageKeywords: {
    PRE_FORECLOSURE: ['lis pendens', 'complaint filed'],
    SHERIFF_SALE: ['sheriff sale', 'writ of execution']
  },
  defaultStrategy: { minEquity: 20, timelineBonus: 21 }
};

export const CA_PROFILE: StateProfile = {
  code: 'CA',
  processType: 'NON_JUDICIAL',
  avgTimelineDays: 120,
  stageKeywords: {
    PRE_FORECLOSURE: ['notice of default', 'nod'],
    AUCTION: ['trustee sale', 'notice of trustee sale', 'nots']
  },
  defaultStrategy: { minEquity: 15, timelineBonus: 7 }
};
```

---

## 4. Adapter Factory Pattern

The `IngestionManager` must become smarter. It shouldn't just run "The Scraper"; it needs to select the right tool for the job.

**Current:**
`SalesWebAdapter` (Hardcoded for NJ-style CivilView sites).

**Future:**
```typescript
class AdapterFactory {
  static getAdaptersForState(state: string): SourceAdapter[] {
    const adapters = [];
    
    // 1. National Aggregators (Always run)
    adapters.push(new AuctionComAdapter());
    adapters.push(new HubzuAdapter());
    
    // 2. State Specifics
    if (state === 'NJ') {
      adapters.push(new NJSalesWebAdapter());
      adapters.push(new NJPublicNoticesAdapter());
    }
    
    if (state === 'FL') {
      adapters.push(new RealforecloseAdapter()); // Common vendor in FL
    }
    
    return adapters;
  }
}
```

---

## 5. Deduplication at Scale

Address normalization becomes harder across state lines.
*   **Issue:** `Springfield` exists in 30+ states.
*   **Fix:** The `dedupe_key` MUST include the state code.
    *   Old: `hash(zip + street + num)`
    *   New: `hash(state + zip + street + num)`
*   **Geo-Spatial:** For non-standard addresses (common in rural land deals), we may need `Lat/Lon` distance matching (< 50 meters) instead of string matching.

---

## 6. Migration Steps

1.  **Refactor Types:** Update `PropertyListing` to remove NJ hardcodes.
2.  **Implement Registry:** Create `StateProfileRegistry`.
3.  **Update Normalizer:** Modify `normalizeStage` to accept a `state` argument and look up keywords from the Registry.
4.  **Strategy Injection:** Update `geminiService` to inject the State Profile into the System Prompt so the AI understands the local laws (e.g., "In Texas, foreclosure extinguishes junior liens immediately...").
