
# Data Reliability: Ingestion Failure & Recovery Protocols

## 1. Philosophy
In foreclosure data ingestion, **Partial Availability > Total Failure**.
If 5% of records are corrupt, we must ingest the 95% valid records and quarantine the rest. If a source is down, we must gracefully degrade to the last known state rather than crashing the dashboard.

---

## 2. The Failure Matrix

| Failure Mode | Symptom / Error | Severity | Auto-Response | Human Action |
| :--- | :--- | :--- | :--- | :--- |
| **Transient Network** | `ECONNRESET`, `ETIMEDOUT`, `503 Service Unavailable` | Low | **Retry w/ Backoff** (Jittered: 2s, 10s, 60s). | None, unless persists > 1hr. |
| **Rate Limiting** | `429 Too Many Requests`, CAPTCHA challenge | Medium | **Cool Down**. Pause worker for 15m. Rotate Proxy/User-Agent. | If persistent, review scraping velocity. |
| **Schema Drift** | DOM Selector returns `null` for critical fields (Price, Date). | **Critical** | **Circuit Break**. Stop ingestion immediately. Prevent bad data pollution. | **Urgent:** Update Scraper Selectors. |
| **Data Rot** | Parsing succeeds, but values are garbage (e.g., Price: "$0.00", Date: "1900-01-01"). | Medium | **Quarantine**. Send specific rows to DLQ. Ingest valid rows. | Analyze DLQ for pattern changes. |
| **Volume Anomaly** | Scraper returns 5 records when usually 500. | High | **Hold & Alert**. Do not overwrite DB. | Verify if source has no listings or if pagination broke. |
| **Zombie Session** | Scraper hangs indefinitely (no timeout). | Low | **Hard Timeout**. Kill process after 120s. | Check memory/resource leaks. |

---

## 3. Resiliency Patterns

### A. The "Yield Threshold" (Volume Protection)
Before committing a scrape batch to the database, compare the count against the 30-day moving average for that source.

```typescript
// Pseudocode Logic
const avgVolume = await db.getAverageVolume('hudson_sheriff'); // e.g., 50
const currentVolume = scrapedData.length; // e.g., 2

if (currentVolume < (avgVolume * 0.1)) {
  // If we found < 10% of usual volume, assume the site layout changed 
  // and we missed the table rows, rather than there being no sales.
  throw new AnomalyError("Volume Drop detected. Requires manual confirmation.");
}
```

### B. The Circuit Breaker
Used for **Schema Drift**. If we detect that critical fields (Address, Sale Date) are parsing as `null` or `undefined` for > 20% of the batch, we trip the breaker.

*   **Open State:** Scraper runs normally.
*   **Tripped State:** Scraper is disabled.
*   **Effect:** Dashboard shows "Data Source Error" badge but serves existing (stale) data. **Do not** wipe the database with empty records.

### C. Dead Letter Queue (DLQ)
For **Data Rot** (individual bad rows in a good batch).

1.  **Ingest:** Valid rows go to `Properties` table.
2.  **Reject:** Invalid rows (e.g., missing address) go to `IngestionErrors` table.
3.  **Review:** Admin dashboard lists DLQ items for manual fix or pattern analysis.

---

## 4. Fallback Strategies (User Experience)

### Strategy A: "Stale Data" Indicator
If the nightly ingestion fails:
1.  **Do not** hide the properties.
2.  **UI Change:** Display a warning banner: *"Market Data Updated: 48 hours ago. Source may be experiencing outages."*
3.  **Risk Band:** Automatically downgrade `ai_score` confidence or mark `risk_band` as "Unknown" for items with sale dates today (since we can't confirm adjournment).

### Strategy B: Manual Override (The "Eject Button")
If the Scraper is broken (Schema Drift) and the fix takes days:
1.  Admin logs into County Sheriff website manually.
2.  Downloads the official PDF/Excel list.
3.  Uses the **Manual Upload (`/ingest`)** endpoint in the app.
4.  System processes this as a high-priority source, temporarily overriding the broken scraper data.

---

## 5. Recovery Runbook (For Engineers)

**Scenario: "Hudson County" Scraper is failing with `SelectorError`.**

1.  **Acknowledge:** Silence PagerDuty.
2.  **Verify:** Visit `salesweb.civilview.com`. Check if they changed `<table id="sales">` to `<div class="grid">`.
3.  **Patch:** Update `SalesWebAdapter.ts` with new Cheerio selectors.
4.  **Test:** Run `npm test services/adapters/salesWebAdapter.test.ts`.
5.  **Deploy:** Push hotfix.
6.  **Backfill:** Trigger `POST /jobs/trigger { source: 'hudson', force: true }` to catch up on missed data.
