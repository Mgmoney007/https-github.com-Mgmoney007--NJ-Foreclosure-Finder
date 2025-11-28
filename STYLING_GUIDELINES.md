
# Frontend Design System: NJ Foreclosure Finder

## 1. Design Philosophy
**"High Signal, Low Noise."**
Our users are investors analyzing dozens of opportunities. The UI must be dense but legible. Color should be used *semantically* (to indicate risk/value), not decoratively.

---

## 2. Color System (Tailwind CSS)

### A. Neutrals (The Backbone)
We use the **Slate** scale to provide a cool, professional financial look, avoiding the harshness of pure black/gray.
*   **Surface (Page BG):** `slate-100` (#F1F5F9) - Low eye strain.
*   **Surface (Cards):** `white` (#FFFFFF) with `slate-200` borders.
*   **Text (Primary):** `slate-900` (#0F172A) - Headings, Data Values.
*   **Text (Secondary):** `slate-500` (#64748B) - Labels, Metadata.
*   **Chrome (Nav):** `slate-900` - Anchors the app.

### B. Functional Colors (The Risk Bands)
Strict semantic mapping for the "Traffic Light" system.

| Semantic Meaning | Tailwind Color | Usage |
| :--- | :--- | :--- |
| **Low Risk / High Equity** | **Emerald** (600/100) | `text-emerald-600`, `bg-emerald-50`, `border-emerald-200` |
| **Moderate Risk** | **Amber** (600/100) | `text-amber-700`, `bg-amber-50`, `border-amber-200` |
| **High Risk / Negative** | **Red/Rose** (600/100) | `text-red-600`, `bg-red-50`, `border-red-200` |
| **Action / Links** | **Blue/Indigo** (600) | Buttons, Links, Highlights. |

---

## 3. Typography

**Font Family:** System Sans (`ui-sans-serif`, SF Pro, Inter).

### Scale
*   **H1 (Page Title):** `text-2xl font-bold tracking-tight text-slate-900`
*   **H2 (Section Header):** `text-lg font-bold text-slate-800`
*   **Data Value (Big):** `text-2xl font-bold text-slate-900` (e.g., Equity Amount)
*   **Label (Small):** `text-xs font-semibold uppercase tracking-wider text-slate-500`
*   **Body:** `text-sm text-slate-600 leading-relaxed`

---

## 4. Component Patterns

### A. The "Property Card"
*   **Shape:** `rounded-xl`
*   **Depth:** `shadow-sm` resting, `shadow-lg` hover.
*   **Border:** 1px `slate-200`.
*   **Key Identifier:** A colored top border (`border-t-4`) matching the Risk Band color. This allows users to scan grid views instantly without reading text.

### B. Badges & Tags
*   **Shape:** `rounded-full` or `rounded-md`.
*   **Padding:** `px-2.5 py-0.5`.
*   **Style:** Subtle background + Dark text (e.g., `bg-blue-50 text-blue-700`).
*   *Avoid solid color badges (like primary buttons) to reduce visual weight.*

### C. Data Tables
*   **Header:** `bg-slate-50`, `text-slate-500`, sticky top.
*   **Rows:** White background, `hover:bg-blue-50` for tracking lines.
*   **Alignment:** Text align Left, Numbers align Right (Monospaced preferred for financials).

---

## 5. Spacing System
Based on the 4pt grid (Tailwind standard).
*   **Container Padding:** `p-6` (24px).
*   **Card Internal Padding:** `p-4` (16px).
*   **Gap (Grid):** `gap-6` (24px).
*   **Gap (Stack):** `space-y-4` (16px).

## 6. Iconography
*   **Library:** Lucide React (`lucide-react`).
*   **Size:** Standard `size={16}` or `size={20}`.
*   **Color:** Muted `text-slate-400` unless interactive.
