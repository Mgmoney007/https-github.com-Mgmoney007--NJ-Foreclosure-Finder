
# Data Model: Property Events & Timeline History

## 1. Core Philosophy
A "Listing" is just a snapshot of a property at a specific point in time. To truly understand a foreclosure, we must model it as a **Stream of Events**. 

This allows us to answer questions like:
*   "How many times has this been adjourned?" (Distress signal)
*   "Was this previously listed as an REO 2 years ago?" (Failed flip?)
*   "Is the opening bid increasing or decreasing?"

---

## 2. Event Types (Enum)

| Event Type | Description | Key Data Payload |
| :--- | :--- | :--- |
| `LIS_PENDENS_FILED` | The formal start of the NJ judicial foreclosure process. | `filing_date`, `docket_number` |
| `FINAL_JUDGMENT` | Court rules in favor of plaintiff. Amount fixed. | `judgment_amount`, `date` |
| `SHERIFF_SALE_SCHEDULED` | A specific date is set for the auction. | `sale_date`, `opening_bid`, `sheriff_location` |
| `SHERIFF_SALE_ADJOURNED` | The sale did not happen; moved to a new date. | `original_date`, `new_date`, `reason` (if known) |
| `AUCTION_LISTED` | Asset appears on private platform (Auction.com, Xome). | `platform`, `start_bid`, `reserve_status` |
| `PRICE_CHANGE` | Significant change in Opening Bid or Est. Value. | `old_price`, `new_price`, `delta_pct` |
| `SOLD_TO_PLAINTIFF` | Bank takes back property (becomes REO). | `winning_bid` (usually $100 or judgment) |
| `SOLD_TO_THIRD_PARTY` | Investor buys at auction. | `winning_bid`, `purchaser_name` |
| `LISTING_REMOVED` | Disappeared from source without 'Sold' status. | `last_seen_date` |

---

## 3. Timeline JSON Structure

The `history` field in the API response is an array of these objects, sorted descending by date.

```typescript
interface TimelineEvent {
  id: string;
  date: string; // ISO 8601
  type: EventType;
  source: string; // "CivilView", "County Records", "User Input"
  description: string; // Human readable summary
  metadata: Record<string, any>; // Flexible payload based on type
}
```

---

## 4. Scenario: The "Zombie" Foreclosure (JSON Sample)

**Story:** 
1.  Default in 2023.
2.  Sale scheduled for Xmas 2023.
3.  Adjourned twice (Owner bankruptcy? Snow storm?).
4.  Finally sold to a 3rd party in Feb 2024.

```json
[
  {
    "id": "evt_4",
    "date": "2024-02-15T14:00:00Z",
    "type": "SOLD_TO_THIRD_PARTY",
    "source": "Hudson County Sheriff",
    "description": "Sold to Third Party Bidder for $315,000",
    "metadata": {
      "winning_bid": 315000,
      "purchaser": "Main St Capital LLC",
      "upset_price": 280000
    }
  },
  {
    "id": "evt_3",
    "date": "2024-01-15T09:00:00Z",
    "type": "SHERIFF_SALE_ADJOURNED",
    "source": "CivilView Scraper",
    "description": "Sale Adjourned to Feb 15, 2024",
    "metadata": {
      "original_date": "2024-01-15",
      "new_date": "2024-02-15",
      "reason": "Plaintiff Request"
    }
  },
  {
    "id": "evt_2",
    "date": "2023-12-25T10:00:00Z",
    "type": "SHERIFF_SALE_ADJOURNED",
    "source": "CivilView Scraper",
    "description": "Sale Adjourned to Jan 15, 2024",
    "metadata": {
      "original_date": "2023-12-25",
      "new_date": "2024-01-15",
      "reason": "Holiday / Court Closed"
    }
  },
  {
    "id": "evt_1",
    "date": "2023-11-01T00:00:00Z",
    "type": "SHERIFF_SALE_SCHEDULED",
    "source": "NJ Public Notices",
    "description": "Sheriff Sale Scheduled for Dec 25, 2023",
    "metadata": {
      "opening_bid": 280000,
      "judgment_amount": 450000,
      "location": "Hudson County Admin Building"
    }
  },
  {
    "id": "evt_0",
    "date": "2023-06-12T00:00:00Z",
    "type": "LIS_PENDENS_FILED",
    "source": "Manual Import (Excel)",
    "description": "Lis Pendens Filed by WELLS FARGO",
    "metadata": {
      "docket": "F-12345-23",
      "county": "Hudson"
    }
  }
]
```

## 5. Implementation Notes

1.  **Immutability:** Once an event happens, it is historical fact. Do not update `evt_1` when the date changes; create `evt_2` (Adjourned).
2.  **Synthesis:** The "Current State" of a property (displayed on the dashboard card) is essentially `events[0]` (the most recent event).
3.  **Deduplication:** If the scraper runs daily and sees "Scheduled for Dec 25" on Dec 1st, 2nd, and 3rd, it should **NOT** create 3 events. It should recognize the state hasn't changed. New events are only created on **State Change** or **Data Change**.
