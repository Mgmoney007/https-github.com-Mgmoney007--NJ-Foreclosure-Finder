
# Product Logic: Saved Searches & Alerting Engine

## 1. Core Concept
**"The Sentinel"**
Saved Searches transform the application from a passive dashboard (User Pull) into an active lead generation tool (System Push). 

The system monitors the stream of incoming/updated properties and checks if they enter a user's specific "Buy Box".

---

## 2. Entity Flow & Lifecycle

### Phase A: Creation (Frontend)
1.  **Definition:** User applies filters on the Dashboard (e.g., "Jersey City, Equity > 25%, Sheriff Sale").
2.  **Persistence:** User clicks "Save Search". System serializes the *current filter state* into `filters_json` and stores it in the `SavedSearch` table.
3.  **Snapshotting:** (Optional) The system immediately runs the search and displays "Current Matches: 12".

### Phase B: Triggering (The "Wake Up" Event)
*   **Trigger Point:** The Alert Engine runs **Post-Enrichment**. 
    *   It cannot run immediately after Ingestion because it relies on `equity_pct` (Calculated) and `ai_score` (AI Service).
*   **Frequency:** Batched run, typically 15 minutes after the Daily Ingestion Job completes.

### Phase C: Matching Logic (The Filter Engine)
For every `Active` Saved Search, the system queries the `PropertyListing` table.

**The "New Match" Criteria:**
A property is considered a "Match" if:
1.  **Criteria Met:** It satisfies ALL filters defined in `filters_json`.
2.  **Novelty Constraint:** 
    *   The property was **Created** in the last 24 hours.
    *   **OR** The property was **Updated** significantly (see Section 3) in the last 24 hours.
    *   **AND** We have not already alerted this specific User about this specific Property ID in the last 7 days (Noise Reduction).

---

## 3. Change Detection & Noise Reduction

We must differentiate between a "New Deal" and "Just Data Noise".

**Significant Updates (Trigger Alert):**
1.  **Price Drop:** `opening_bid` decreases by > 5%.
2.  **Valuation Spike:** `estimated_value` increases, pushing `equity_pct` across the user's threshold (e.g., was 18%, now 22%).
3.  **Stage Progression:** Status changes from `Pre-Foreclosure` -> `Sheriff Sale`.
4.  **Adjournment:** Sale date changes (only if user has a specific alert for "Upcoming Auctions").

**Ignored Updates (No Alert):**
1.  Minor typo fixes in address.
2.  Scraper re-ingesting the exact same data.
3.  `ai_score` fluctuating by < 5 points.

---

## 4. Execution Logic (Pseudocode)

```typescript
function runAlertEngine() {
  // 1. Get properties modified in the last batch
  const freshProperties = db.getPropertiesModifiedSince(lastRunTimestamp);

  // 2. Load all active Saved Searches
  const activeSearches = db.getSavedSearches({ alerts_enabled: true });

  const notificationsToSend = [];

  // 3. Match Matrix
  for (const search of activeSearches) {
    
    // Convert JSON filters to Query Predicates
    const matches = freshProperties.filter(prop => {
      const f = search.filters;
      if (prop.equity_pct < f.min_equity) return false;
      if (f.cities && !f.cities.includes(prop.city)) return false;
      if (f.stages && !f.stages.includes(prop.stage)) return false;
      return true;
    });

    for (const match of matches) {
      // 4. Check Noise Reduction History
      const sentRecently = await db.hasAlerted(search.user_id, match.id, '7_days');
      
      if (!sentRecently) {
        notificationsToSend.push({
          user: search.user_id,
          property: match,
          reason: determineReason(match) // "New Listing" vs "Price Drop"
        });
        
        // 5. Update History
        await db.logAlert(search.user_id, match.id);
      }
    }
  }

  // 6. Delivery (Digest Mode)
  // Group by User to send 1 email with 5 properties, rather than 5 emails.
  sendDigestEmails(notificationsToSend);
}
```

---

## 5. User Experience (UX) Requirements

1.  **"New" Badge:** When a user clicks a notification link to the dashboard, the matching properties should have a visual "New" or "Updated" indicator for their session.
2.  **Email Digest Layout:**
    *   Subject: "3 New Deals match 'Hudson Flips'"
    *   Body: Table summary (Address, Equity %, Est Profit).
    *   CTA: "Analyze in Dashboard".
3.  **One-Click Unsubscribe:** Footer of the email must allow disabling that specific Saved Search immediately.

## 6. Edge Cases
*   **Zero Results:** Do not send "0 matches found" emails. Silence is golden.
*   **Too Many Results:** If a search matches > 50 new properties (e.g., user saves "State: NJ"), cap the alert to "50+ new properties found" to prevent spamming, and prompt user to refine filters.
