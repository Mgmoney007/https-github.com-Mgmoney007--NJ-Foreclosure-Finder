
import {
  SourceAdapter,
  NormalizedSearchParams,
  IngestionResult,
  AdapterIngestionSummary,
  SavedSearchRepository,
  PropertyRepository,
  NormalizationService,
  AIService,
  PropertyListing
} from "../../types";

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

    const savedSearch = await this.deps.savedSearchRepo.getById(savedSearchId);
    if (!savedSearch) {
      throw new Error(`SavedSearch ${savedSearchId} not found`);
    }

    const { filters } = savedSearch;

    // Map SavedSearch.filters → NormalizedSearchParams in a type-safe way
    const searchParams: NormalizedSearchParams = {
      zip: filters.zip,
      // If both city and cities[] exist, prefer city, else first cities entry
      city: filters.city ?? (filters.cities && filters.cities.length > 0 ? filters.cities[0] : undefined),
      county: filters.county,
      propertyTypes: filters.propertyTypes,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice ?? filters.max_price,
      stages: filters.stages
    };

    const adaptersToRun = this.deps.adapters;

    for (const adapter of adaptersToRun) {
      if (adapter.supportsState("NJ")) {
        const summary = await this.runAdapterForSearch(adapter, searchParams);
        adapterSummaries.push(summary);
      }
    }

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
      updatedCount: 0,
      itemsSkippedNormalization: 0,
      itemsFailedProcessing: 0
    };

    console.log(`[Pipeline][${adapter.id}] Starting search...`);

    try {
      // --- 1. Fetch raw listings with simple retry ---
      let rawListings;
      try {
        rawListings = await adapter.search(searchParams);
      } catch (firstError) {
        console.warn(
          `[Pipeline][${adapter.id}] Initial search failed, retrying once...`,
          firstError
        );
        rawListings = await adapter.search(searchParams);
      }

      summary.rawCount = rawListings.length;
      console.log(
        `[Pipeline][${adapter.id}] Retrieved ${summary.rawCount} raw listings.`
      );

      // --- 2. Process each listing independently ---
      for (const raw of rawListings) {
        try {
          // 2.1 Normalize
          const normalized = this.deps.normalizationService.normalizeRawListing(raw);
          if (!normalized) {
            summary.itemsSkippedNormalization++;
            continue;
          }
          summary.normalizedCount++;

          // 2.2 Compute dedupe key from address
          const dedupeKey = this.deps.normalizationService.computeDedupKey({
            street: normalized.address.street,
            city: normalized.address.city,
            zip: normalized.address.zip
          });

          // Ensure audit.dedupe_key is set on the normalized listing
          const withDedupe: PropertyListing = {
            ...normalized,
            audit: {
              ...normalized.audit,
              dedupe_key: dedupeKey
            }
          };

          // 2.3 Look up existing record
          const existing = await this.deps.propertyRepo.findByDedupeKey(dedupeKey);

          // 2.4 AI enrichment in its own try/catch
          let enriched: PropertyListing;
          try {
            enriched = await this.deps.aiService.enrichListing(withDedupe);
          } catch (aiError) {
            console.error(
              `[Pipeline][${adapter.id}] AI enrichment failed for dedupeKey=${dedupeKey}`,
              aiError
            );
            summary.itemsFailedProcessing++;
            continue;
          }

          const now = new Date().toISOString();

          if (!existing) {
            // New listing: set ingestion + last_updated
            const toInsert: PropertyListing = {
              ...enriched,
              audit: {
                ...enriched.audit,
                ingestion_timestamp: enriched.audit.ingestion_timestamp || now,
                last_updated: now,
                dedupe_key: dedupeKey
              }
            };

            await this.deps.propertyRepo.insert(toInsert);
            summary.createdCount++;
          } else {
            // Existing listing: preserve ingestion_timestamp, update last_updated
            const toUpdate: PropertyListing = {
              ...enriched,
              id: existing.id,
              audit: {
                ...existing.audit,
                last_updated: now,
                dedupe_key: dedupeKey
              }
            };

            await this.deps.propertyRepo.updateById(existing.id, toUpdate);
            summary.updatedCount++;
          }
        } catch (itemError) {
          summary.itemsFailedProcessing++;
          console.error(
            `[Pipeline][${adapter.id}] Item processing failed`,
            itemError
          );
          continue;
        }
      }
    } catch (adapterError: any) {
      summary.error = adapterError.message ?? "Unknown adapter error";
      console.error(
        `[Pipeline][${adapter.id}] Adapter failed completely:`,
        adapterError
      );
    }

    console.log(
      `[Pipeline][${adapter.id}] Completed adapter ingestion:`,
      JSON.stringify(summary)
    );

    return summary;
  }
}

