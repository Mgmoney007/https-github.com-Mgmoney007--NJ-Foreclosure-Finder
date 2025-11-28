
# Background Jobs System Design

## Overview
The NJ Foreclosure Finder relies on asynchronous background processing to maintain data freshness without impacting API latency. 

**Key Challenges:**
1.  **Sheriff Sale Volatility:** Dates change daily (Adjournments). The system must reconcile "missing" properties as adjourned or sold.
2.  **AI Cost Control:** We cannot re-score every property every day. Intelligent triggers are required.
3.  **Source Fragility:** County websites are prone to downtime. Robust retry logic is essential.

---

## 1. Job Architecture Diagram

```mermaid
graph TD
    Cron[Daily Scheduler (02:00 AM EST)] -->|Trigger| IngestMgr[Ingestion Manager]
    
    subgraph "Ingestion Pipeline"
        IngestMgr -->|Fan-out| Adapter1[SalesWeb Adapter]
        IngestMgr -->|Fan-out| Adapter2[Auction.com Adapter]
        Adapter1 -->|Raw Listings| RawQueue[(Raw Listing Queue)]
        Adapter2 -->|Raw Listings| RawQueue
    end

    subgraph "Normalization Worker"
        RawQueue -->|Pop| Normalizer[Normalization Service]
        Normalizer -->|Dedupe & Merge| DB[(Postgres DB)]
    end

    subgraph "Enrichment Pipeline"
        DB -->|Trigger: New/Updated| ScoreQueue[(AI Scoring Queue)]
        ScoreQueue -->|Batch Process| GeminiWorker[Gemini Service]
        GeminiWorker -->|Update Score| DB
    end

    subgraph "Reconciliation"
        Cron -->|Trigger| AuditWorker[Adjournment Auditor]
        AuditWorker -->|Check Stale| DB
        AuditWorker -->|Mark Sold/Adjourned| DB
    end
```

---

## 2. Job Definitions & Pseudocode

### Job A: Daily Ingestion Fan-Out
**Frequency:** Daily at 2:00 AM EST (Post-county updates)
**Goal:** Scrape all configured sources and hydrate the Raw Queue.

```typescript
// services/jobs/ingestionJob.ts

import { SALES_WEB_ADAPTER, AUCTION_ADAPTER } from '../config/adapters';
import { queueRawListing } from '../services/queue';

export async function runDailyIngestion() {
  const regions = ['Hudson', 'Bergen', 'Essex', 'Union'];
  const adapters = [SALES_WEB_ADAPTER, AUCTION_ADAPTER];

  console.log(`[Job] Starting Daily Ingestion: ${new Date().toISOString()}`);

  for (const adapter of adapters) {
    for (const county of regions) {
      try {
        // 1. Fetch from Source (with exponential backoff)
        const rawListings = await withRetry(() => 
          adapter.search({ county, stages: ['sheriff_sale', 'reo'] })
        );

        // 2. Push to Queue (Fast producer)
        // We do NOT process here to avoid blocking the scraper
        await Promise.all(rawListings.map(listing => 
          queueRawListing({
            type: 'NORMALIZE_RAW',
            payload: listing,
            priority: 'HIGH'
          })
        ));

        console.log(`[Job] Queued ${rawListings.length} items from ${adapter.label} - ${county}`);

      } catch (error) {
        console.error(`[Job] Failed adapter ${adapter.id} for ${county}`, error);
        // Alert Devs via PagerDuty/Slack if a primary source fails completely
      }
    }
  }
}
```

### Job B: Normalization & Upsert Worker
**Trigger:** Message on `RawQueue`
**Goal:** Idempotent processing of raw data into the Unified Schema.

```typescript
// services/workers/normalizationWorker.ts

import { normalizeRawListing } from '../services/normalizationService';
import { Property, ForeclosureEvent } from '../models'; // ORM assumption
import { queueAIScoring } from '../services/queue';

export async function processRawListing(job: Job<RawListing>) {
  const raw = job.data;
  
  // 1. Normalize
  const normalized = normalizeRawListing(raw);
  
  // 2. Database Transaction
  await db.transaction(async (trx) => {
    
    // A. Find or Create Property (Asset)
    // Match strict on dedupe_key (address hash)
    let property = await trx('properties')
      .where({ dedupe_key: normalized.audit.dedupe_key })
      .first();

    if (!property) {
      property = await trx('properties').insert(normalized.address).returning('*');
    }

    // B. Find or Create Foreclosure Event (Temporal)
    // We check if an ACTIVE event exists for this property
    const existingEvent = await trx('events')
      .where({ property_id: property.id, status: 'ACTIVE' })
      .first();

    // 3. Change Detection Logic
    const hasPriceChange = existingEvent && existingEvent.opening_bid !== normalized.foreclosure.opening_bid;
    const hasStatusChange = existingEvent && existingEvent.status !== normalized.foreclosure.status;
    const isNew = !existingEvent;

    // 4. Upsert Event Data
    await trx('events')
      .insert({ ...normalized.foreclosure, property_id: property.id })
      .onConflict(['property_id', 'sale_date']) 
      .merge(); // Upsert

    // 5. Trigger AI Scoring ONLY if meaningful change occurred
    // This saves tokens and cost.
    if (isNew || hasPriceChange || hasStatusChange) {
      await queueAIScoring({
        propertyId: property.id,
        reason: isNew ? 'NEW_LISTING' : 'DATA_CHANGE'
      });
    }
  });
}
```

### Job C: Smart AI Scoring Worker
**Trigger:** Message on `ScoreQueue`
**Goal:** Generate insights using Gemini, respecting rate limits.

```typescript
// services/workers/scoringWorker.ts

import { analyzeProperty } from '../services/geminiService';
import { RateLimiter } from 'limiter';

// Gemini Flash allows ~15 RPM in free tier, higher in paid
const limiter = new RateLimiter({ tokensPerInterval: 10, interval: "minute" });

export async function processScoring(job: Job<{ propertyId: string }>) {
  // 1. Rate Limit Check
  await limiter.removeTokens(1);

  // 2. Hydrate Context
  const property = await db.getPropertyWithHistory(job.data.propertyId);

  // 3. Skip if "Junk" Asset (Optimization)
  // If equity is deep negative (e.g. -50%), AI insight isn't needed to know it's bad.
  if (property.valuation.equity_pct < -20) {
    await db.updateAnalysis(property.id, {
      risk_band: 'High',
      ai_summary: 'Auto-rejected due to deep negative equity.',
      ai_score: 0
    });
    return;
  }

  // 4. Perform Analysis
  const analysis = await analyzeProperty(property);

  // 5. Save & Notify
  await db.updateAnalysis(property.id, analysis);
  
  // Check if this new score triggers any user Saved Searches
  await triggerAlerts(property, analysis);
}
```

### Job D: Adjournment Auditor (The "Cleanup" Job)
**Frequency:** Daily at 6:00 PM EST (After auctions close)
**Goal:** Detect properties that *vanished* from the source, implying they were sold or adjourned without an update.

```typescript
// services/jobs/auditJob.ts

export async function reconcileAdjournments() {
  // 1. Find "Stale" Active Listings
  // Properties marked 'Scheduled' for today or past, but weren't updated in today's ingestion
  const today = new Date().toISOString().split('T')[0];
  
  const staleListings = await db('events')
    .where('sale_date', '<=', today)
    .andWhere('status', 'Scheduled')
    .andWhere('last_ingested_at', '<', today); // Wasn't seen in today's scrape

  for (const listing of staleListings) {
    // 2. Heuristic: If it disappears from the Sheriff's list on sale day, 
    // it was likely Adjourned or Sold. We cannot know for sure without a post-sale scrape result.
    // Action: Mark as "Review Needed" or "Pending Outcome"
    
    await db('events')
      .where({ id: listing.id })
      .update({
        status: 'Pending Verification',
        notes: `System Note: Listing disappeared from source on ${today}. Likely Sold or Adjourned.`
      });
      
    // 3. Add to a specific "Missing" queue for manual or advanced scraper verification
    await queueVerification(listing.id);
  }
}
```
