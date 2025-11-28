# NJ Foreclosure Finder — API Blueprint v1.0

## Overview
This API provides programmatic access to normalized New Jersey foreclosure data. It is designed around the **PropertyListing** aggregate, which denormalizes the relational database entities (Property, ForeclosureEvent, Source) into a single, consumable JSON object for the frontend.

**Base URL:** `/api/v1`
**Content-Type:** `application/json`

---

## 1. Properties Resource
The core resource representing a real estate asset in a specific state of foreclosure.

### List Properties (Search & Filter)
`GET /properties`

Returns a paginated list of properties matching the criteria.

**Query Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | int | Page number (default 1) | `1` |
| `limit` | int | Items per page (default 20, max 100) | `50` |
| `sort` | string | Sort field and direction | `equity_pct:desc`, `sale_date:asc`, `ai_score:desc` |
| `stage` | enum[] | Filter by `NormalizedStage` | `sheriff_sale,reo` |
| `min_equity` | number | Minimum equity percentage | `20` |
| `max_bid` | number | Maximum opening bid | `200000` |
| `city` | string | Filter by city name (exact match) | `Jersey City` |
| `county` | string | Filter by county | `Hudson` |
| `risk_band` | enum | Filter by AI Risk Band | `Low` |
| `q` | string | Full-text search on address | `Main St` |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "address": { "full": "123 Main St...", "city": "Jersey City", "zip": "07302" },
      "foreclosure": { "stage": "sheriff_sale", "opening_bid": 150000 },
      "valuation": { "equity_pct": 32.5, "estimated_value": 400000 },
      "ai_analysis": { "ai_score": 85, "risk_band": "Low" }
    }
  ],
  "meta": {
    "total": 142,
    "page": 1,
    "last_page": 3
  }
}
```

### Get Property Detail
`GET /properties/{id}`

Returns the full `PropertyListing` object, including detailed AI rationale, full source history, and extended notes.

### Get Property History
`GET /properties/{id}/history`

Returns the timeline of foreclosure events for this specific property (e.g., previous adjournments, past listings).

**Response:**
```json
[
  {
    "date": "2024-10-01",
    "event": "Sheriff Sale Adjourned",
    "source": "CivilView Scraper",
    "status_text": "Adjourned to Nov 15"
  },
  {
    "date": "2024-08-15",
    "event": "Lis Pendens Filed",
    "source": "Public Records",
    "status_text": "NOD"
  }
]
```

### Trigger AI Analysis
`POST /properties/{id}/analyze`

Forces a real-time re-scoring of the property using the Gemini LLM. Useful if manual data overrides have been made.

**Response:** `200 OK` (Returns updated `AIAnalysis` object)

---

## 2. Saved Searches (Alerts)
Manage user-defined "Buy Boxes" for push notifications.

### List Saved Searches
`GET /saved-searches`

### Create Saved Search
`POST /saved-searches`

**Payload:**
```json
{
  "name": "Hudson County Flips",
  "filters": {
    "county": "Hudson",
    "min_equity_pct": 25,
    "stages": ["sheriff_sale", "reo"]
  },
  "alerts_enabled": true
}
```

### Execute Saved Search
`GET /saved-searches/{id}/results`

Runs the filter criteria stored in the saved search and returns the standard `/properties` list response.

---

## 3. Ingestion & Export

### Ingest Data
`POST /ingest`

Uploads raw data for normalization. Supports CSV files or triggers for specific scraper adapters.

**Payload (Multipart/Form-Data):**
*   `file`: (Binary CSV)
*   `source_type`: "excel_import" | "scraper_trigger"
*   `adapter_id`: (Optional, e.g., "nj-salesweb-civilview")

### Export Data
`GET /export`

Generates a CSV export of the current query results, formatted specifically for the user's Excel tracker.

**Query Parameters:** Matches `GET /properties` filters.

**Response:** `text/csv` attachment.

---

## 4. Error Handling

Standard HTTP status codes are used:

*   `200 OK`: Success.
*   `400 Bad Request`: Invalid filter parameters or malformed JSON.
*   `404 Not Found`: Resource does not exist.
*   `422 Unprocessable Entity`: Validation failure (e.g., missing required fields in POST).
*   `500 Internal Server Error`: System failure (DB connection, AI Service timeout).

**Error Response Body:**
```json
{
  "error": {
    "code": "INVALID_FILTER",
    "message": "min_equity cannot be negative.",
    "details": {}
  }
}
```
