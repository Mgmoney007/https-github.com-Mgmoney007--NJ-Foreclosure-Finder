
import { 
  SourceAdapter, 
  NormalizedSearchParams, 
  IngestionResult, 
  AdapterIngestionSummary,
  SavedSearchRepository,
  PropertyRepository,
  NormalizationService,
  AIService
} from '../../types';

export interface IngestionPipelineDeps {
  adapters: SourceAdapter[];
  savedSearchRepo: SavedSearchRepository;
  propertyRepo: PropertyRepository;
  normalizationService: NormalizationService;
  aiService: AIService;
}

export class IngestionPipeline {
  constructor(private deps: IngestionPipelineDeps) {}

  /**
   * Orchestrates the full ingestion flow for a specific Saved Search configuration.
   * 
   * @param savedSearchId - The ID of the saved search to execute.
   * @returns A comprehensive result object detailing the performance of all adapters.
   */
  async runForSavedSearch(savedSearchId: string): Promise<IngestionResult> {
    const startedAt = new Date().toISOString();
    const adapterSummaries: AdapterIngestionSummary[] = [];

    // TODO: 1. Load SavedSearch from repository
    // const savedSearch = await this.deps.savedSearchRepo.getById(savedSearchId);
    // if (!savedSearch) throw new Error(`SavedSearch ${savedSearchId} not found`);

    // TODO: 2. Determine which adapters to run based on SavedSearch criteria or configuration
    // const adaptersToRun = this.deps.adapters;

    // TODO: 3. Run adapters (Sequentially or Parallel based on rate-limit requirements)
    /*
    for (const adapter of adaptersToRun) {
      if (adapter.supportsState("NJ")) { // Example check
        const summary = await this.runAdapterForSearch(adapter, savedSearch.filters);
        adapterSummaries.push(summary);
      }
    }
    */

    const finishedAt = new Date().toISOString();

    return {
      savedSearchId,
      adapterSummaries,
      startedAt,
      finishedAt
    };
  }

  /**
   * Executes a single adapter, normalizes its output, enriches it with AI, 
   * and persists the results to the database.
   */
  private async runAdapterForSearch(
    adapter: SourceAdapter,
    searchParams: NormalizedSearchParams
  ): Promise<AdapterIngestionSummary> {
    const summary: AdapterIngestionSummary = {
      adapterId: adapter.id,
      rawCount: 0,
      normalizedCount: 0,
      createdCount: 0,
      updatedCount: 0
    };

    try {
      // TODO: 1. Fetch Raw Data from Source
      // console.log(`[Pipeline] Running adapter ${adapter.id}...`);
      // const rawListings = await adapter.search(searchParams);
      // summary.rawCount = rawListings.length;

      /*
      for (const raw of rawListings) {
        try {
          // TODO: 2. Normalize Data
          // const input = this.deps.normalizationService.normalizeRawListing(raw);
          // if (!input) continue;
          // summary.normalizedCount++;

          // TODO: 3. Compute Deduplication Key
          // const dedupeKey = this.deps.normalizationService.computeDedupKey(input.address);

          // TODO: 4. Check for Existing Property (Deduplication)
          // const existing = await this.deps.propertyRepo.findByDedupeKey(dedupeKey);

          if (!existing) {
             // TODO: 5a. New Listing -> AI Enrich -> Insert
             // const enriched = await this.deps.aiService.enrichListing(input);
             // await this.deps.propertyRepo.insert(enriched);
             // summary.createdCount++;
          } else {
             // TODO: 5b. Existing Listing -> Check for changes -> Update
             // Compare critical fields (Price, Status, Date) to decide if update is needed
             // await this.deps.propertyRepo.updateById(existing.id, input);
             // summary.updatedCount++;
          }
        } catch (itemError) {
          console.error(`[Pipeline] Error processing item in adapter ${adapter.id}`, itemError);
        }
      }
      */

    } catch (adapterError: any) {
      // Capture adapter-level failure (e.g., website down) without crashing the whole pipeline
      summary.error = adapterError.message || 'Unknown adapter error';
      console.error(`[Pipeline] Adapter ${adapter.id} failed completely:`, adapterError);
    }

    return summary;
  }
}
