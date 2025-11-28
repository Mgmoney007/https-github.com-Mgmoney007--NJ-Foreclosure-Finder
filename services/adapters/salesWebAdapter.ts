
import { SourceAdapter, NormalizedSearchParams, RawListing } from '../../types';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Configuration for known NJ Counties using the SalesWeb/CivilView platform
const COUNTY_CONFIG: Record<string, string> = {
  'BERGEN': 'https://salesweb.civilview.com/Sales/SalesSearch?CountyId=2',
  'HUDSON': 'https://salesweb.civilview.com/Sales/SalesSearch?CountyId=9',
  'PASSAIC': 'https://salesweb.civilview.com/Sales/SalesSearch?CountyId=16',
  'UNION': 'https://salesweb.civilview.com/Sales/SalesSearch?CountyId=20',
  'MORRIS': 'https://salesweb.civilview.com/Sales/SalesSearch?CountyId=14',
  'MONMOUTH': 'https://salesweb.civilview.com/Sales/SalesSearch?CountyId=13',
  // Fallback/Generic URL
  'DEFAULT': 'https://salesweb.civilview.com/Sales/SalesSearch'
};

/**
 * SalesWebAdapter
 * 
 * Robust scraper for CivilView/SalesWeb portals.
 * Features:
 * - Dynamic column mapping (header detection)
 * - Detail page enrichment (fetching secondary data)
 * - Concurrency control for detail fetching
 * - Robust text normalization
 */
export class SalesWebAdapter implements SourceAdapter {
  id = 'nj-salesweb-civilview';
  label = 'NJ Sheriff Sales (CivilView/SalesWeb)';
  
  private baseUrl = 'https://salesweb.civilview.com';
  
  // Headers to mimic a real browser and avoid basic bot detection
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };

  supportsState(state: string): boolean {
    return state.toUpperCase() === 'NJ';
  }

  async search(params: NormalizedSearchParams): Promise<RawListing[]> {
    const targetUrl = this.resolveUrl(params.county);
    console.log(`[SalesWebAdapter] Initialization: Target=${targetUrl}`);

    try {
      // 1. Fetch Main List
      const response = await axios.get(targetUrl, { 
        headers: this.headers,
        timeout: 15000 
      });

      const $ = cheerio.load(response.data);
      
      // 2. Identify Data Table
      // CivilView usually uses <table class="table table-striped">
      const table = $('table.table-striped');
      if (!table.length) {
        console.warn(`[SalesWebAdapter] No data table found at ${targetUrl}. Layout might have changed.`);
        return [];
      }

      // 3. Dynamic Header Mapping
      // Map "Sheriff #" -> index 0, "Address" -> index 2, etc.
      const colMap = this.mapColumnHeaders($, table);
      
      const initialListings: Partial<RawListing>[] = [];

      // 4. Parse Rows
      table.find('tbody tr').each((_, element) => {
        try {
          const row = $(element);
          const cells = row.find('td');
          
          if (cells.length < 3) return; // Skip spacers/mobile details

          const rawListing = this.parseRow($, cells, colMap, targetUrl);
          if (rawListing) {
            initialListings.push(rawListing);
          }
        } catch (rowError) {
          console.error(`[SalesWebAdapter] Row parsing error:`, rowError);
        }
      });

      console.log(`[SalesWebAdapter] Found ${initialListings.length} items. Starting detail enrichment...`);

      // 5. Enrich with Details (Parallel Batches)
      // We limit concurrency to avoid aggressive rate limiting/blocking
      const enrichedListings = await this.enrichListings(initialListings as RawListing[]);

      return enrichedListings;

    } catch (error) {
      console.error(`[SalesWebAdapter] Critical failure fetching ${targetUrl}:`, error);
      // Return empty array rather than throwing to prevent crashing the entire ingestion job
      return []; 
    }
  }

  /**
   * Resolves the specific county URL or falls back to generic.
   */
  private resolveUrl(county?: string): string {
    if (!county) return COUNTY_CONFIG['DEFAULT'];
    const normalized = county.toUpperCase().trim();
    return COUNTY_CONFIG[normalized] || COUNTY_CONFIG['DEFAULT'];
  }

  /**
   * Creates a mapping of Header Name -> Column Index.
   * This handles cases where counties reorder columns (e.g. putting Price before Status).
   */
  private mapColumnHeaders($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): Record<string, number> {
    const map: Record<string, number> = {};
    table.find('thead tr th').each((index, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text.includes('sheriff')) map['case_id'] = index;
      if (text.includes('defendant') || text.includes('title') || text.includes('case')) map['title'] = index;
      if (text.includes('address')) map['address'] = index;
      if (text.includes('sale date')) map['date'] = index;
      if (text.includes('price') || text.includes('upset')) map['price'] = index;
      if (text.includes('status')) map['status'] = index;
    });
    return map;
  }

  /**
   * Parses a single HTML row using the dynamic column map.
   */
  private parseRow($: cheerio.CheerioAPI, cells: cheerio.Cheerio<any>, map: Record<string, number>, baseUrl: string): Partial<RawListing> | null {
    // Helper to safely get text
    const txt = (idx?: number) => idx !== undefined && cells.eq(idx) ? cells.eq(idx).text().trim() : '';

    const address = txt(map['address']);
    if (!address) return null; // Address is mandatory

    const statusRaw = txt(map['status']);
    const dateRaw = txt(map['date']);
    const amountRaw = txt(map['price']);
    const caseTitle = txt(map['title']);
    
    // Extract Link
    const linkHref = cells.find('a').attr('href');
    const fullUrl = linkHref 
      ? (linkHref.startsWith('http') ? linkHref : `${this.baseUrl}${linkHref}`) 
      : baseUrl;

    const { plaintiff, defendant } = this.parseCaseTitle(caseTitle);

    return {
      raw_address: address,
      raw_status_text: statusRaw,
      raw_stage_hint: 'Sheriff Sale', // Implicit
      raw_sale_date: dateRaw,
      raw_opening_bid: this.cleanMoneyString(amountRaw),
      raw_estimated_value: null, // Usually found on detail page
      raw_plaintiff: plaintiff,
      raw_defendant: defendant,
      raw_detail_url: fullUrl,
      source_type: 'Scraper',
      debug_metadata: {
        adapter: this.id,
        raw_case_title: caseTitle
      }
    };
  }

  /**
   * Visits detail pages in controlled batches to extract extra data.
   * - Extracts "Approx. Upset Price" if main table missed it.
   * - Extracts "Attorney" or specific "Terms".
   */
  private async enrichListings(listings: RawListing[]): Promise<RawListing[]> {
    const BATCH_SIZE = 5; // Concurrent requests
    const DELAY_MS = 200; // Throttle between batches
    
    const results: RawListing[] = [];

    // Helper to process a single listing
    const processDetail = async (item: RawListing): Promise<RawListing> => {
      // If we already have a bid and it looks like a generic page, skip deep fetch
      if (!item.raw_detail_url || item.raw_detail_url.includes('SalesSearch')) return item;

      try {
        const res = await axios.get(item.raw_detail_url, { headers: this.headers, timeout: 5000 });
        const $ = cheerio.load(res.data);
        
        // CivilView Detail pages often use a vertical table or definition list structure
        // We look for specific labels
        
        // 1. Try to find "Approx. Upset" if we don't have a bid
        if (!item.raw_opening_bid) {
           const upsetRow = $('tr:contains("Upset"), tr:contains("Judgment")').first();
           const upsetVal = upsetRow.find('td').last().text().trim();
           if (upsetVal) item.raw_opening_bid = this.cleanMoneyString(upsetVal);
        }

        // 2. Try to find "Assessed Value" or "Appraisal"
        // This is rare but valuable
        const valueRow = $('tr:contains("Assessed"), tr:contains("Appraisal")').first();
        if (valueRow.length) {
           const val = valueRow.find('td').last().text().trim();
           item.raw_estimated_value = this.cleanMoneyString(val);
        }

        // 3. Extra notes from specific rows
        const attorneyRow = $('tr:contains("Attorney")').text().trim();
        if (attorneyRow) {
            item.debug_metadata = { ...item.debug_metadata, attorney_info: attorneyRow };
        }

      } catch (err) {
        // detail fetch failed, return original item
        // console.warn(`Detail fetch failed for ${item.raw_address}`); 
      }
      return item;
    };

    // Batch Processing
    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE);
      const processedBatch = await Promise.all(batch.map(item => processDetail(item)));
      results.push(...processedBatch);
      
      // Simple sleep to respect server
      if (i + BATCH_SIZE < listings.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    return results;
  }

  private parseCaseTitle(title: string): { plaintiff: string | null, defendant: string | null } {
    if (!title) return { plaintiff: null, defendant: null };
    
    // Robust regex for splitting case titles
    // Matches: " v. ", " vs. ", " vs ", " versus ", " V. ", " V "
    const splitter = /\s+(?:vs\.?|v\.?|versus)\s+/i;
    
    if (splitter.test(title)) {
      const parts = title.split(splitter);
      return {
        plaintiff: parts[0].trim(),
        defendant: parts[1].trim()
      };
    }
    
    return { plaintiff: null, defendant: title };
  }

  private cleanMoneyString(str: string): string | null {
    if (!str || str.toLowerCase().includes('n/a') || str.trim() === '') return null;
    
    // Remove non-numeric chars except decimal point
    // Handle "$ 123,456.00" -> "123456.00"
    const cleaned = str.replace(/[^0-9.]/g, '');
    
    // Parse to float to ensure validity, then return string as per RawListing contract
    const floatVal = parseFloat(cleaned);
    return isNaN(floatVal) ? null : cleaned;
  }
}
