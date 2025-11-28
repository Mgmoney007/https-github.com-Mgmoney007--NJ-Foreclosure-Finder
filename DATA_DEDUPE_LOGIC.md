
# Data Engineering: Advanced Deduplication Heuristics

## 1. The Challenge
Real estate data is notoriously dirty. Foreclosure lists often rely on human entry (Sheriff officers) or scraped text, leading to high variability.

**Goal:** Generate a deterministic `dedupe_key` that acts as a fingerprint.
*   `123 Main St, Jersey City, NJ` 
*   `123 MAIN STREET, Unit 4, Jersey City`
*   `123 Main St #4, Jersey City, NJ 07302`
*   **Target:** All must resolve to the SAME entity (or parent entity).

---

## 2. The 5-Step Normalization Pipeline

### Step 1: Sanitation (The "Wash")
*   **Lowercase** everything.
*   **ASCII Transliteration:** Convert `é` -> `e`, `ñ` -> `n` (rare in NJ addresses but good practice).
*   **Punctuation Strip:** Remove `,`, `.`, `'`, `"`, `;`.
    *   *Exception:* Keep `-` and `/` if part of a number (e.g., `12-14 Main St`).
    *   *Exception:* Keep `#` temporarily to identify units, then strip.

### Step 2: Tokenization & Expansion (The "Standardize")
We map common abbreviations to their full canonical form (USPS Standard).
*   **Suffixes:** `st`->`street`, `ave`->`avenue`, `rd`->`road`, `blvd`->`boulevard`.
*   **Directionals:** `n`->`north`, `sw`->`southwest`.
*   **Routes:** `rt`->`route`, `rte`->`route`, `hwy`->`highway`.
*   **Units:** `apt`->`unit`, `ste`->`unit`, `#`->`unit`, `fl`->`floor`.

### Step 3: Numeric Normalization
*   **Ordinals:** `1st`->`1`, `2nd`->`2`, `third`->`3`.
*   **Ranges:** `123-125 Main St` -> `123 main street` (Primary anchor is the first number).

### Step 4: Geo-Anchoring (City/Zip Logic)
*   **Zip Code:** The strongest anchor. If Zips match, we can be lenient on City spelling.
*   **NJ Township Problem:** `Woodbridge` vs `Woodbridge Twp` vs `Iselin` (a CDP inside Woodbridge).
    *   *Rule:* If Zip matches, ignore City mismatch.
    *   *Rule:* Remove `twp`, `township`, `boro`, `borough` from city names.

### Step 5: Key Generation
`dedupe_key = hash(normalized_street_num + normalized_street_name + normalized_unit + normalized_zip)`

---

## 3. Implementation Pseudocode (TypeScript)

```typescript
const SUFFIX_MAP = {
  st: 'street', ave: 'avenue', rd: 'road', blvd: 'boulevard',
  dr: 'drive', ln: 'lane', ct: 'court', pl: 'place',
  hwy: 'highway', rt: 'route', rte: 'route',
  cir: 'circle', ter: 'terrace'
};

const UNIT_MAP = {
  apt: 'unit', ste: 'unit', '#': 'unit', no: 'unit', suite: 'unit'
};

function generateDedupeKey(rawAddress: string): string {
  // 1. Sanitize
  let clean = rawAddress.toLowerCase().trim();
  
  // 2. Parse Components (Heuristic Regex)
  // Matches: "123" "Main St" "Apt 4" "Jersey City" "NJ" "07302"
  const parts = parseAddressToComponents(clean); 
  
  // 3. Normalize Components
  const num = parts.number.replace(/[^0-9a-z]/g, ''); // "123-A" -> "123a"
  
  const street = parts.street
    .split(' ')
    .map(token => SUFFIX_MAP[token] || token) // Expand "st" -> "street"
    .filter(t => t !== '.')
    .join(''); // "mainstreet"
    
  const unit = normalizeUnit(parts.unit); // "#4" -> "unit4"
  
  const zip = parts.zip.substring(0, 5); // 5-digit only
  
  // 4. Construct Key
  // Format: {zip}-{num}-{street}-{unit}
  // Example: 07302-123-mainstreet-unit4
  return `${zip}-${num}-${street}-${unit}`;
}

function normalizeUnit(rawUnit: string): string {
  if (!rawUnit) return 'nounit';
  
  // Remove "unit", "apt", "#" and just keep the identifier
  let val = rawUnit;
  Object.keys(UNIT_MAP).forEach(k => {
    val = val.replace(new RegExp(`\\b${k}\\b`, 'g'), '');
  });
  val = val.replace('#', '').trim();
  
  // Handle "Floor" specially
  if (val.includes('floor') || val.includes('fl')) {
    val = val.replace(/(?:st|nd|rd|th)?\s*(?:floor|fl)/g, ''); // "2nd floor" -> "2"
    return `fl${val}`;
  }
  
  return `unit${val.replace(/[^0-9a-z]/g, '')}`;
}
```

---

## 4. Edge Case Handling

### The "Listing vs. Legal" Problem
*   Listing: `123 Main St`
*   Legal: `123-125 Main St`
*   **Resolution:** We strip ranges from the house number. `123-125` becomes `123`. We assume the first number is the primary identifier.

### The "Corner Property" Problem
*   Property sits on corner of Main St and 1st Ave.
*   Source A: `10 Main St`
*   Source B: `5 1st Ave`
*   **Resolution:** These will generate DIFFERENT dedupe keys. 
    *   *Strategy:* This requires a "Related Entity" link, usually found via Block/Lot matching (Map data) rather than string matching. For MVP, these remain separate listings until manually merged or linked via Block/Lot scraper.

### The "Spelling Error" Fallback
If `dedupe_key` fails but `zip` matches:
*   Calculate **Levenshtein Distance** on the `street` component.
*   If distance < 2 (e.g. `Main St` vs `Mian St`), treat as Match.
*   *Note:* Only run this computationally expensive check if `zip` + `house_number` match exactly.

---

## 5. NJ Specific Nuances

| Input | Standardized Output | Reason |
| :--- | :--- | :--- |
| `Route 9` | `route9` | "Route" and "Highway" are interchangeable in NJ data. |
| `Hwy 1 & 9` | `highway1and9` | Common combined highway names. |
| `Old Tappan Rd` | `oldtappanroad` | Keep multi-word street names intact (removed spaces). |
| `Mt. Pleasant` | `mountpleasant` | Expand "Mt" and "St" (Saint) in street names. |
