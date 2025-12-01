import express, { Request as ExpressRequest, Response as ExpressResponse, RequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { 
  PropertyListing, 
  SavedSearch, 
  NormalizedStage, 
  RiskBand, 
  AIAnalysis, 
  SavedSearchRepository,
  PropertyRepository, 
  TimelineEvent, 
  EventType 
} from './types';
import { ingestCSVData } from './services/dataService';
import { analyzeProperty } from './services/geminiService';
import { MOCK_CSV_DATA } from './constants';

// --- Services & Pipeline ---
import { IngestionPipeline } from './services/pipeline/ingestionPipeline';
import { SalesWebAdapter } from './services/adapters/salesWebAdapter';
import { NormalizationService } from './services/normalizationService';
import { GeminiAIService } from './services/GeminiAIService';

// Fix for missing Node.js types if @types/node is not available
declare var __dirname: string;
declare var require: any;
declare var module: any;

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3001;
const API_PREFIX = '/api/v1';

// --- Middleware ---
app.use(cors() as any); 
app.use(express.json()); 

// Multer config for CSV ingestion
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- Custom Request Interfaces for improved type safety ---
interface MulterRequest extends ExpressRequest {
  file?: any;
  body: {
    source_type: string;
    adapter_id?: string;
    saved_search_id?: string;
  };
}

interface SavedSearchRequest extends ExpressRequest {
  body: {
    name: string;
    filters: SavedSearch['filters'];
    alerts_enabled?: boolean;
  };
}

// --- Mock Database / Data Access Layer ---
// In production, replace these in-memory arrays with Postgres queries using 'pg' or Prisma.
let propertiesDB: PropertyListing[] = ingestCSVData(MOCK_CSV_DATA);

const savedSearchesDB: SavedSearch[] = [
  {
    id: "search-001",
    name: "Hudson County Flips",
    filters: {
      cities: ["Jersey City", "Hoboken"],
      min_equity_pct: 20,
      county: "HUDSON" // Added for Scraper targeting
    },
    alerts_enabled: true,
    created_at: new Date().toISOString()
  }
];

// --- Pipeline Initialization ---
const savedSearchRepo: SavedSearchRepository = {
  getById: async (id: string) => savedSearchesDB.find(s => s.id === id) || null
};

const propertyRepo: PropertyRepository = {
  findByDedupeKey: async (key: string) => propertiesDB.find(p => p.audit.dedupe_key === key) || null,
  insert: async (listing: PropertyListing) => { propertiesDB.push(listing); },
  updateById: async (id: string, listing: Partial<PropertyListing>) => {
    const idx = propertiesDB.findIndex(p => p.id === id);
    if (idx !== -1) {
      propertiesDB[idx] = { ...propertiesDB[idx], ...listing };
    }
  }
};

const pipeline = new IngestionPipeline({
  adapters: [new SalesWebAdapter()],
  savedSearchRepo,
  propertyRepo,
  normalizationService: new NormalizationService(),
  aiService: new GeminiAIService()
});

// --- Helper: Standardized Error Response ---
const sendError = (res: ExpressResponse, statusCode: number, code: string, message: string, details?: any) => {
  res.status(statusCode).json({
    error: { code, message, details }
  });
};

// --- Helper: Haversine Distance Calculation (for radius search) ---
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3958.8; // Radius of Earth in miles
  const toRad = (x: number) => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in miles
};

// --- Helper: Filter and Paginate Properties ---
type FilterResult = {
  data: PropertyListing[];
  meta: {
    total: number;
    page: number;
    last_page: number;
  };
} | null;

const filterAndPaginateProperties = (
  req: ExpressRequest,
  res: ExpressResponse,
  properties: PropertyListing[]
): FilterResult => {
  const { 
    page = '1', limit = '20', sort, 
    stage, min_equity, city, county, risk_band, q,
    latitude, longitude, radius_miles, // Geo-spatial filters
    min_lot_size_sqft, max_lot_size_sqft, // Assessor data filters
    min_beds, max_beds, min_baths, max_baths, property_types // Assessor data filters
  } = req.query;

  let results = [...properties];

  // Basic Filtering
  if (stage) {
    const stages = (stage as string).split(',');
    results = results.filter(p => stages.includes(p.foreclosure.stage as string));
  }
  if (min_equity) {
    const min = parseFloat(min_equity as string);
    results = results.filter(p => (p.valuation.equity_pct || 0) >= min);
  }
  if (city) {
    results = results.filter(p => p.address.city.toLowerCase() === (city as string).toLowerCase());
  }
  if (risk_band) {
    results = results.filter(p => p.ai_analysis.risk_band === risk_band);
  }
  if (q) {
    const query = (q as string).toLowerCase();
    results = results.filter(p => 
      p.address.full.toLowerCase().includes(query) || 
      p.foreclosure.defendant?.toLowerCase().includes(query)
    );
  }

  // Geo-spatial Filtering (Radius Search)
  if (latitude && longitude && radius_miles) {
    const searchLat = parseFloat(latitude as string);
    const searchLon = parseFloat(longitude as string);
    const searchRadius = parseFloat(radius_miles as string);

    if (!isNaN(searchLat) && !isNaN(searchLon) && !isNaN(searchRadius)) {
      results = results.filter(p => {
        if (p.address.lat && p.address.lng) {
          const distance = haversineDistance(searchLat, searchLon, p.address.lat, p.address.lng);
          return distance <= searchRadius;
        }
        return false;
      });
    } else {
      sendError(res, 400, 'BAD_REQUEST', 'Invalid latitude, longitude, or radius_miles');
      return null; // Response sent, indicate by returning null
    }
  }

  // Assessor Data Filtering
  if (min_lot_size_sqft) {
    const min = parseInt(min_lot_size_sqft as string);
    results = results.filter(p => (p.lot_size_sqft || 0) >= min);
  }
  if (max_lot_size_sqft) {
    const max = parseInt(max_lot_size_sqft as string);
    results = results.filter(p => (p.lot_size_sqft || Infinity) <= max);
  }
  if (min_beds) {
    const min = parseInt(min_beds as string);
    results = results.filter(p => (p.beds || 0) >= min);
  }
  if (max_beds) {
    const max = parseInt(max_beds as string);
    results = results.filter(p => (p.beds || Infinity) <= max);
  }
  if (min_baths) {
    const min = parseFloat(min_baths as string);
    results = results.filter(p => (p.baths || 0) >= min);
  }
  if (max_baths) {
    const max = parseFloat(max_baths as string);
    results = results.filter(p => (p.baths || Infinity) <= max);
  }
  if (property_types) {
    const types = (property_types as string).split(',').map(t => t.toLowerCase());
    results = results.filter(p => p.property_type && types.includes(p.property_type.toLowerCase()));
  }

  // Sorting
  if (sort) {
    const [field, dir] = (sort as string).split(':');
    const isDesc = dir === 'desc';
    results.sort((a, b) => {
      let valA, valB;
      if (field === 'equity_pct') {
        valA = a.valuation.equity_pct || 0;
        valB = b.valuation.equity_pct || 0;
      } else if (field === 'sale_date') {
        valA = new Date(a.foreclosure.sale_date || 0).getTime();
        valB = new Date(b.foreclosure.sale_date || 0).getTime();
      } else if (field === 'ai_score') {
        valA = a.ai_analysis.ai_score || 0;
        valB = b.ai_analysis.ai_score || 0;
      } else {
        return 0;
      }
      return isDesc ? valB - valA : valA - valB;
    });
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = results.slice(startIndex, startIndex + limitNum);

  return {
    data: paginated,
    meta: {
      total: results.length,
      page: pageNum,
      last_page: Math.ceil(results.length / limitNum)
    }
  };
};

// =============================================================================
// 1. Properties Resource
// =============================================================================

/**
 * GET /properties
 * List properties with filtering, sorting, and pagination.
 */
app.get(`${API_PREFIX}/properties`, (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const result = filterAndPaginateProperties(req, res, propertiesDB);
    if (result) { // Only send response if filterAndPaginateProperties didn't already send an error
      res.json(result);
    }
  } catch (error) {
    // This catch block will only be hit for unexpected errors that are not handled
    // by sendError within filterAndPaginateProperties.
    if (!res.headersSent) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch properties', error);
    }
  }
});

/**
 * GET /properties/:id
 * Get details for a specific property.
 */
app.get(`${API_PREFIX}/properties/:id`, (req: ExpressRequest, res: ExpressResponse) => {
  const property = propertiesDB.find(p => p.id === req.params.id);
  if (!property) {
    return sendError(res, 404, 'NOT_FOUND', 'Property not found');
  }
  res.json(property);
});

/**
 * GET /properties/:id/history
 * Get foreclosure event timeline.
 */
app.get(`${API_PREFIX}/properties/:id/history`, (req: ExpressRequest, res: ExpressResponse) => {
  const property = propertiesDB.find(p => p.id === req.params.id);
  if (!property) {
    return sendError(res, 404, 'NOT_FOUND', 'Property not found');
  }

  const history: TimelineEvent[] = [];
  const now = new Date();

  // 1. LIS_PENDENS_FILED (Base event for all foreclosures)
  // Assume it was filed 6-18 months ago
  const filingDate = new Date(now);
  filingDate.setMonth(now.getMonth() - (Math.floor(Math.random() * 12) + 6)); 
  history.push({
    id: uuidv4(),
    date: filingDate.toISOString(),
    type: EventType.LIS_PENDENS_FILED,
    source: "County Public Records",
    description: `Lis Pendens Filed against ${property.foreclosure.defendant || 'Unknown Owner'}`,
    metadata: {
      county: property.address.county,
      docket_number: `F-${Math.floor(Math.random() * 90000) + 10000}-23`
    }
  });

  // 2. Current Listing / Scheduled Sale / REO event (Most recent event reflecting property.foreclosure)
  if (property.foreclosure.sale_date) {
    const saleDate = new Date(property.foreclosure.sale_date);
    let eventType: EventType;
    let description: string;
    let metadata: Record<string, any> = {
      opening_bid: property.foreclosure.opening_bid,
    };

    if (property.foreclosure.stage === NormalizedStage.SHERIFF_SALE) {
      eventType = EventType.SHERIFF_SALE_SCHEDULED;
      description = `Sheriff Sale Scheduled for ${saleDate.toLocaleDateString()}`;
      metadata.sheriff_location = `${property.address.county} County Admin Building`;
    } else if (property.foreclosure.stage === NormalizedStage.AUCTION) {
      eventType = EventType.AUCTION_LISTED;
      description = `Auction Listed on ${property.source.source_name} for ${saleDate.toLocaleDateString()}`;
      metadata.platform = property.source.source_name;
      metadata.start_bid = property.foreclosure.opening_bid;
    } else {
      eventType = EventType.SHERIFF_SALE_SCHEDULED; // Fallback
      description = `Foreclosure Sale Scheduled for ${saleDate.toLocaleDateString()}`;
    }

    history.push({
      id: uuidv4(),
      date: saleDate.toISOString(),
      type: eventType,
      source: property.source.source_name,
      description: description,
      metadata: metadata,
    });

    // 3. Adjournment (if current status is 'Adjourned', simulate a prior adjournment)
    if (property.foreclosure.status.toLowerCase().includes('adjourned')) {
      const originalSaleDate = new Date(saleDate);
      originalSaleDate.setDate(saleDate.getDate() - (Math.floor(Math.random() * 10) + 7)); // 7-16 days before current date
      history.push({
        id: uuidv4(),
        date: originalSaleDate.toISOString(),
        type: EventType.SHERIFF_SALE_ADJOURNED,
        source: property.source.source_name,
        description: `Sale Adjourned from ${originalSaleDate.toLocaleDateString()} to ${saleDate.toLocaleDateString()}`,
        metadata: {
          original_date: originalSaleDate.toISOString().split('T')[0],
          new_date: saleDate.toISOString().split('T')[0],
          reason: "Plaintiff Request"
        }
      });
    }

  } else if (property.foreclosure.stage === NormalizedStage.REO) {
      // If it's REO, assume it was recently sold to plaintiff
      const reoDate = new Date(now);
      reoDate.setDate(now.getDate() - (Math.floor(Math.random() * 30) + 1)); // 1-30 days ago
      history.push({
        id: uuidv4(),
        date: reoDate.toISOString(),
        type: EventType.SOLD_TO_PLAINTIFF,
        source: property.source.source_name,
        description: `Property became Bank-Owned (REO)`,
        metadata: {
          winning_bid: 100 // Common for bank take-back
        },
      });
  }


  // Sort history by date descending
  history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json(history);
});

/**
 * POST /properties/:id/analyze
 * Trigger real-time AI analysis.
 */
app.post(`${API_PREFIX}/properties/:id/analyze`, async (req: ExpressRequest, res: ExpressResponse) => {
  const propertyIndex = propertiesDB.findIndex(p => p.id === req.params.id);
  if (propertyIndex === -1) {
    return sendError(res, 404, 'NOT_FOUND', 'Property not found');
  }

  const property = propertiesDB[propertyIndex];

  try {
    // Call the AI Service
    // We are calling analyzeProperty directly here as it's a direct API interaction,
    // not through the pipeline's AIService.
    const analysis: AIAnalysis = await analyzeProperty(property);
    
    // Update the record
    propertiesDB[propertyIndex] = {
      ...property,
      ai_analysis: analysis,
      audit: { ...property.audit, last_updated: new Date().toISOString() }
    };

    res.json(propertiesDB[propertyIndex].ai_analysis);
  } catch (error) {
    sendError(res, 500, 'AI_SERVICE_ERROR', 'Failed to analyze property', error);
  }
});

// =============================================================================
// 2. Saved Searches
// =============================================================================

/**
 * GET /saved-searches
 */
app.get(`${API_PREFIX}/saved-searches`, (req: ExpressRequest, res: ExpressResponse) => {
  res.json(savedSearchesDB);
});

/**
 * POST /saved-searches
 */
app.post(`${API_PREFIX}/saved-searches`, (req: ExpressRequest, res: ExpressResponse) => {
  // Cast body to expected shape
  const { name, filters, alerts_enabled } = req.body as SavedSearchRequest['body'];
  
  if (!name || !filters) {
    return sendError(res, 400, 'BAD_REQUEST', 'Missing name or filters');
  }

  // Basic validation for filters
  if (filters.latitude && (isNaN(parseFloat(filters.latitude as any)) || parseFloat(filters.latitude as any) < -90 || parseFloat(filters.latitude as any) > 90)) {
    return sendError(res, 400, 'BAD_REQUEST', 'Invalid latitude');
  }
  if (filters.longitude && (isNaN(parseFloat(filters.longitude as any)) || parseFloat(filters.longitude as any) < -180 || parseFloat(filters.longitude as any) > 180)) {
    return sendError(res, 400, 'BAD_REQUEST', 'Invalid longitude');
  }
  if (filters.radius_miles && (isNaN(parseFloat(filters.radius_miles as any)) || parseFloat(filters.radius_miles as any) <= 0)) {
    return sendError(res, 400, 'BAD_REQUEST', 'Invalid radius_miles');
  }

  const newSearch: SavedSearch = {
    id: uuidv4(),
    name,
    filters,
    alerts_enabled: !!alerts_enabled,
    created_at: new Date().toISOString()
  };

  savedSearchesDB.push(newSearch);
  res.status(201).json(newSearch);
});

/**
 * GET /saved-searches/:id/results
 * Execute a saved search.
 */
app.get(`${API_PREFIX}/saved-searches/:id/results`, async (req: ExpressRequest, res: ExpressResponse) => {
  const search = savedSearchesDB.find(s => s.id === req.params.id);
  if (!search) {
    return sendError(res, 404, 'NOT_FOUND', 'Saved search not found');
  }

  // Construct query parameters from saved search filters
  const queryParams: Record<string, any> = {};
  for (const key in search.filters) {
    if (search.filters.hasOwnProperty(key)) {
      const value = (search.filters as any)[key];
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams[key] = value.join(',');
        } else {
          queryParams[key] = String(value);
        }
      }
    }
  }

  try {
    // Create a new request-like object for filtering to simulate the query parameters
    const syntheticReq = {
        ...req, // Keep original request properties
        query: { ...req.query, ...queryParams } // Override/merge query params
    } as unknown as ExpressRequest;

    const result = filterAndPaginateProperties(syntheticReq, res, propertiesDB);
    if (result) { // Only send response if filterAndPaginateProperties didn't already send an error
      res.json(result);
    }
  } catch (error) {
    if (!res.headersSent) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to execute saved search properties', error);
    }
  }
});

// =============================================================================
// 3. Ingestion & Export
// =============================================================================

/**
 * POST /ingest
 * Handle CSV upload or Trigger Scrapers.
 */
app.post(`${API_PREFIX}/ingest`, upload.single('file') as any, async (req: ExpressRequest, res: ExpressResponse) => {
  // Cast to MulterRequest or access body directly. 
  // Since we used ExpressRequest in signature, we assume body is any.
  // Note: req.file comes from multer.
  const file = (req as unknown as MulterRequest).file;
  const { source_type, adapter_id, saved_search_id } = req.body;

  if (source_type === 'excel_import' && file) {
    try {
      const csvContent = file.buffer.toString('utf-8');
      const newListings = ingestCSVData(csvContent);
      
      // Update DB (Mock Append)
      propertiesDB = [...propertiesDB, ...newListings];
      
      res.json({
        message: 'Ingestion successful',
        count: newListings.length,
        audit_timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendError(res, 422, 'PARSING_ERROR', 'Failed to parse CSV file', error);
    }
  } else if (source_type === 'scraper_trigger') {
    // If a saved_search_id is provided, run the pipeline for that config
    // We default to the mock search ID 'search-001' if none provided for easy demoing
    const searchId = saved_search_id || "search-001";
    
    try {
        console.log(`[Server] Triggering active scrape for search: ${searchId}`);
        // Await the pipeline so the UI knows when data is ready
        const result = await pipeline.runForSavedSearch(searchId);
        
        console.log(`[Server] Scrape complete. New items created: ${result.adapterSummaries.reduce((acc, s) => acc + s.createdCount, 0)}`);
        
        res.json({ 
            message: `Ingestion pipeline completed.`,
            result 
        });
    } catch (err: any) {
        console.error(`[Server] Pipeline Execution Failed:`, err);
        sendError(res, 500, 'PIPELINE_ERROR', 'Scraping pipeline failed', err.message);
    }
  } else {
    sendError(res, 400, 'BAD_REQUEST', 'Invalid source_type or missing file');
  }
});

/**
 * GET /export
 * Export current view to CSV.
 */
app.get(`${API_PREFIX}/export`, (req: ExpressRequest, res: ExpressResponse) => {
  // Logic to convert filtered propertiesDB to CSV
  // For skeleton, just sending text/csv header
  const csvHeader = "Address,Status,Stage,Equity %\n";
  const csvRows = propertiesDB.map(p => 
    `"${p.address.full}","${p.foreclosure.status}","${p.foreclosure.stage}",${p.valuation.equity_pct}`
  ).join('\n');

  res.header('Content-Type', 'text/csv');
  res.attachment(`foreclosures_export_${new Date().toISOString()}.csv`);
  res.send(csvHeader + csvRows);
});

// =============================================================================
// 4. Static Frontend Serving (Production Only)
// =============================================================================

if (process.env.NODE_ENV === 'production') {
  // Serve static files from the 'public' directory (mapped from React build in Dockerfile)
  app.use(express.static(path.join(__dirname, 'public')) as any);
  // Handle client-side routing, return all requests to React app
  app.get('*', (req: ExpressRequest, res: ExpressResponse) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// =============================================================================
// Start Server
// =============================================================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nNJ Foreclosure Finder API is running.`);
    console.log(`Base URL: http://localhost:${PORT}${API_PREFIX}`);
    console.log(`Resources: Properties, Saved Searches, Ingestion`);
    if (process.env.NODE_ENV === 'production') {
      console.log(`Frontend served from /public`);
    }
  });
}

export default app;