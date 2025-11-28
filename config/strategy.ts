
import { NormalizedStage } from "../types";

/**
 * NJ Foreclosure Investment Strategy Configuration
 * 
 * Defines the "Buy Box" parameters and scoring weights used to 
 * categorize properties into Risk Bands and compute AI Scores.
 * 
 * UPDATE: Parameters tightened by Investment Committee to reflect
 * high carrying costs and eviction timelines in NJ.
 */

export const SCORING_CONFIG = {
  // 1. Equity Thresholds (The Margin of Safety)
  equity: {
    minimum_viable: 20,    // COMMITTEE UPDATE: Raised from 15% to 20% to account for NJ transfer tax & holding costs.
    target_sheriff: 35,    // COMMITTEE UPDATE: Sheriff sales need deep discount (35%) to justify title risk.
    target_reo: 20,        // REOs are cleaner, so 20% spread is acceptable.
    max_score_cap: 100     // Cap for normalization
  },

  // 2. Timeline Thresholds (Days until Sale)
  timeline: {
    urgent_window: 21,     // 0-21 days: Immediate Action
    watch_window: 45,      // 22-45 days: Due Diligence
    stale_threshold: -1    // Passed dates
  },

  // 3. Stage Weights (Risk Adjustment)
  // Higher weight = Preferred / Cleaner deal structure
  stage_weights: {
    [NormalizedStage.REO]: 1.0,            // Bank owned, clear title, vacant/broom swept usually.
    [NormalizedStage.SHERIFF_SALE]: 0.7,   // COMMITTEE UPDATE: Downgraded from 0.8. High title risk.
    [NormalizedStage.AUCTION]: 0.6,        // COMMITTEE UPDATE: Downgraded from 0.7. Sight unseen, cash heavy.
    [NormalizedStage.PRE_FORECLOSURE]: 0.5, // Speculative, long timeline.
    [NormalizedStage.UNKNOWN]: 0.3
  },

  // 4. Occupancy Adjustments (Score Impact)
  occupancy_penalty: {
    vacant: 5,        // Bonus: Immediate possession (Reduced bonus, vacancy has theft risk).
    occupied: -25,    // COMMITTEE UPDATE: Increased penalty from -15. Eviction in NJ is 6-12 months.
    unknown: -10      // COMMITTEE UPDATE: Increased uncertainty penalty.
  },

  // 5. Priority Band Logic
  bands: {
    low_risk: {
      min_equity: 30, // COMMITTEE UPDATE: Need 30% spread to be considered "Safe".
      max_days: 60
    },
    moderate_risk: {
      min_equity: 20,
      max_days: 90
    }
  }
};
