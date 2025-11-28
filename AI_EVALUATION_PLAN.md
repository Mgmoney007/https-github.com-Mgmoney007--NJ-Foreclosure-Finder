
# AI Evaluation Strategy: Rules vs. LLM

## 1. Objective
To quantify the "Value Add" of Gemini 2.5 Flash over standard deterministic logic.
*   **Primary Question:** Does the AI identify risks in the *unstructured data* (Notes, Legal Descriptions) that the Rule Engine misses?
*   **Secondary Question:** Does the AI hallucinate risks where none exist?

---

## 2. The Golden Dataset (Ground Truth)

We categorize test vectors into three "Complexity Tiers" to stress-test specific capabilities.

### Tier 1: The "Math Check" (N=50)
*   **Composition:** Clean data, valid numbers, empty notes.
*   **Example:** `Est Value: $400k`, `Bid: $200k`, `Occupancy: Vacant`.
*   **Expected Winner:** **Tie**. Rules and AI should both flag this as "Low Risk".

### Tier 2: The "Text Trap" (N=30)
*   **Composition:** Good math, but disqualifying keywords in unstructured text.
*   **Example:** 
    *   `Equity`: 45% (Looks amazing)
    *   `Notes`: "Property subject to structural fire damage; demolition order pending."
*   **Expected Winner:** **AI**. 
    *   *Rule Engine:* Sees 45% equity -> "Low Risk" (False Positive).
    *   *AI:* Reads "demolition" -> "High Risk" (True Negative).

### Tier 3: The "Nuance" (N=20)
*   **Composition:** Borderline math, mitigating factors in text.
*   **Example:**
    *   `Equity`: 18% (Below 20% threshold -> Rule fails).
    *   `Notes`: "Turnkey condition, tenant paying $3500/mo, lease expires next month."
*   **Expected Winner:** **AI**. 
    *   *Rule Engine:* "High Risk" (Strict cutoff).
    *   *AI:* May upgrade to "Moderate" citing cash flow and easy possession.

---

## 3. Evaluation Metrics

| Metric | Definition | Target |
| :--- | :--- | :--- |
| **Semantic Recall** | % of "Text Trap" risks identified. | > 90% |
| **Math Fidelity** | Frequency of AI hallucinating equity numbers. | < 1% |
| **Agreement Rate** | How often AI Risk Band matches Rule Risk Band. | 60-75% |
| **Conservative Bias** | Tendency of AI to rate risk *higher* than Rules. | Positive Bias Expected |

---

## 4. Experiment Implementation

### Step 1: Baseline Execution
Run `services/normalizationService.ts` on the dataset.
*   Output: `heuristic_risk_band`

### Step 2: AI Execution
Run `services/geminiService.ts` on the same dataset.
*   Output: `ai_risk_band`, `rationale`

### Step 3: Comparison Logic
```typescript
if (heuristic === 'Low' && ai === 'High') {
  flagForReview("AI detected hidden risk OR AI hallucinated");
} else if (heuristic === 'High' && ai === 'Low') {
  flagForReview("AI found hidden value OR AI ignored math constraints");
}
```

---

## 5. Expected Findings & Hypotheses

1.  **The "Notes" Gap:** We expect the Rule Engine to have a **100% failure rate** on Tier 2 (Text Traps) because it presently ignores the `notes` field. This is the primary ROI justification for the AI cost.
    
2.  **The "Eviction" Penalty:** Gemini is instructed to be skeptical of NJ evictions. We expect AI scores to be consistently 10-15 points lower than Rule scores for "Occupied" properties, reflecting a more realistic "Time-Value of Money" adjustment.

3.  **Hallucination Risk:** Gemini may over-index on generic disclaimers (e.g., "Sold as is") found in almost every listing, marking them as High Risk unnecessarily. *Correction:* We may need to tune the System Instruction to ignore standard boilerplate.

## 6. Action Plan
1.  Generate 20 "Text Trap" synthetic records.
2.  Run batch evaluation script.
3.  Tune `SYSTEM_INSTRUCTION` in `geminiService` to ignore "boilerplate" risks if the False Positive rate on text is > 10%.
