
import { GoogleGenAI, Type } from "@google/genai";
import { PropertyListing, AIAnalysis, RiskBand } from "../types";
import { SCORING_CONFIG } from "../config/strategy";

// NOTE: In a real production environment, this would be a backend proxy.
const apiKey = process.env.API_KEY;

// Fail gracefully if no key is present
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * JSON Schema Definition for the AI Model Output
 * Ensures the LLM returns data strictly matching our TypeScript interfaces.
 */
const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ai_score: { 
      type: Type.INTEGER, 
      description: "A calculated score from 0-100 representing investment attractiveness based on the provided strategy." 
    },
    risk_band: { 
      type: Type.STRING, 
      enum: ["Low", "Moderate", "High", "Unknown"],
      description: "The categorical risk level." 
    },
    ai_summary: { 
      type: Type.STRING, 
      description: "A concise, 25-word executive summary for the dashboard." 
    },
    rationale: { 
      type: Type.STRING, 
      description: "A short paragraph explaining the positive and negative factors contributing to the score." 
    }
  },
  required: ["ai_score", "risk_band", "ai_summary", "rationale"]
};

/**
 * Reusable Prompt Template
 * Injects the dynamic strategy config and specific property data.
 */
const SYSTEM_INSTRUCTION = `
You are a Skeptical Investment Committee Member for a distressed real estate fund in New Jersey.
Your job is NOT to find reasons to buy, but to find reasons NOT to buy. You focus heavily on downside protection.

New Jersey Context:
- Judicial state: Foreclosures take years.
- Evictions: Taking possession of occupied units takes 6-12 months and costs thousands.
- Title: Sheriff sales often have unrecorded liens (municipal water, sewer) that survive the sale.

### INSTRUCTIONS
1. Analyze the Property Data against the Strategy Configuration.
2. Calculate an 'ai_score' (0-100):
   - BASE: Start with a score based on Equity % (higher equity = higher score).
   - MODIFIER (Occupancy): Apply the 'occupancy_penalty' STRICTLY.
   - MODIFIER (Stage): Apply 'stage_weights'. Penalize Sheriff Sales for title risk.
   - MODIFIER (Timeline): Urgent deals (0-21 days) get a slight bonus; stale deals get a penalty.
3. Assign a 'risk_band' (Low, Moderate, High) based on the 'bands' logic.
   - CRITICAL: If Equity % is below 'minimum_viable', AUTOMATICALLY mark as High Risk.
4. Draft a 'rationale' that sounds like a risk warning (e.g., "Equity spread of 22% is insufficient given Occupied status and NJ eviction timelines.").
5. Draft an 'ai_summary' that is blunt and decisive.
`;

export const analyzeProperty = async (property: PropertyListing): Promise<AIAnalysis> => {
  // Default fallback if API is missing or fails
  const fallback: AIAnalysis = {
    ai_score: 0,
    risk_band: RiskBand.UNKNOWN,
    ai_summary: "AI Analysis Unavailable",
    rationale: "API Key missing or service unreachable."
  };

  if (!ai) return fallback;

  try {
    // 1. Prepare Context
    // We strip out heavy objects to save tokens, focusing on the decision drivers
    const analysisContext = {
      address: property.address,
      financials: property.valuation,
      foreclosure_details: {
        stage: property.foreclosure.stage,
        status: property.foreclosure.status,
        date: property.foreclosure.sale_date,
        occupancy: property.occupancy
      },
      notes: property.notes
    };

    const prompt = `
      ### STRATEGY CONFIGURATION (The Buy Box)
      ${JSON.stringify(SCORING_CONFIG)}

      ### PROPERTY DATA
      ${JSON.stringify(analysisContext)}
      
      Analyze this property. Be skeptical.
    `;

    // 2. Call Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        temperature: 0.2, // Low temperature for deterministic scoring
      }
    });

    // 3. Parse Response
    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    const result = JSON.parse(text) as AIAnalysis;
    return result;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      ...fallback,
      rationale: "Error during AI processing."
    };
  }
};
