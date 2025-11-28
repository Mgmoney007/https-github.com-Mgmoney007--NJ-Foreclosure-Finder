# Conceptual Data Model Architecture

## 1. Entity Separation Principle
The architecture moves away from a flat "Excel-row" mentality to a relational model that separates the **Physical Asset (Property)** from the **Temporal Event (ForeclosureEvent)**. 

*   **Property Entity**: Acts as the anchor. Information like `Address`, `Estimated Value`, and `Occupancy` are intrinsic to the real estate itself. This allows the system to track a single property across multiple foreclosure cycles (e.g., if a property falls out of foreclosure and re-enters years later).
*   **ForeclosureEvent Entity**: Captures the transient legal state. Fields like `Stage` (Sheriff Sale, Auction), `Opening Bid`, `Sale Date`, and `Defendant` (Owner) are attached here. This separation ensures historical data integrity; if a sale is adjourned or cancelled, the event status changes, but the property record remains stable.

## 2. Audit & Ingestion
The **Source Entity** creates a strict audit trail. In foreclosure investing, data reliability is low (dates change daily). By linking a `Source` (URL, Timestamp) to a `ForeclosureEvent`, the system can implement "Last-Write-Wins" logic based on the most credible source (e.g., a direct County Sheriff URL overrides a generic aggregator) and prevent stale data from overwriting fresh updates.

## 3. User Context
**SavedSearch** is modeled as a first-class entity to support the "Push vs. Pull" workflow. Instead of users manually filtering tables every day, the filtered criteria are serialized (`filters_json`). This enables a background worker to match new `ForeclosureEvent` ingestions against `SavedSearch` criteria to trigger alerts, transforming the app from a passive dashboard to an active lead generation tool.