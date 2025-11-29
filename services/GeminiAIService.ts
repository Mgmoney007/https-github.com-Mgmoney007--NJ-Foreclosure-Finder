
import { AIService, PropertyListing } from "../types";
import { analyzeProperty } from "./geminiService";

export class GeminiAIService implements AIService {
  async enrichListing(listing: PropertyListing): Promise<PropertyListing> {
    const analysis = await analyzeProperty(listing);

    return {
      ...listing,
      ai_analysis: analysis,
      audit: {
        ...listing.audit,
        last_updated: new Date().toISOString()
      }
    };
  }
}
