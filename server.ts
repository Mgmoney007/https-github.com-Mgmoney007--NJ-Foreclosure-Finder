
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PropertyListing, SavedSearch, NormalizedStage, RiskBand, AIAnalysis } from './types';
import { ingestCSVData } from './services/dataService';
import { analyzeProperty } from './services/geminiService';
import { MOCK_CSV_DATA } from './constants';

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3001;
const API_PREFIX = '/api/v1';

// --- Middleware ---
app.use(cors() as any);
app.use(express.json() as any);

// Multer config for CSV ingestion
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- Mock Database / Data Access Layer ---
// In production, replace these in-memory arrays with Postgres queries using 'pg' or Prisma.
let propertiesDB: PropertyListing[] = ingestCSVData(MOCK_CSV_DATA);

const savedSearchesDB: SavedSearch[] = [
  {
    id: "search-001",
    name: "Hudson County Flips",
    filters: {
      cities: ["Jersey City", "Hoboken"],
      min_equity_pct: 20
    },
    alerts_enabled: true,
    created_at: new Date().toISOString()
  }
];

// --- Helper: Standardized Error Response ---
const sendError = (res: any, statusCode: number, code: string, message: string, details?: any) => {
  res.status(statusCode).json({
    error: { code, message, details }
  });
};

// =============================================================================
// 1. Properties Resource
// =============================================================================

/**
 * GET /properties
 * List properties with filtering, sorting, and pagination.
 */
app.get(`${API_PREFIX}/properties`, (req: any, res: any) => {
  try {
    const { 
      page = '1', limit = '20', sort, 
      stage, min_equity, city, county, risk_band, q 
    } = req.query;

    let results = [...propertiesDB];

    // Filtering
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

    res.json({
      data: paginated,
      meta: {
        total: results.length,
        page: pageNum,
        last_page: Math.ceil(results.length / limitNum)
      }
    });
  } catch (error) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch properties', error);
  }
});

/**
 * GET /properties/:id
 * Get details for a specific property.
 */
app.get(`${API_PREFIX}/properties/:id`, (req: any, res: any) => {
  const property = propertiesDB.find(p => p.id === req.params.id);
  if (!property) {
    return sendError(res, 404, 'NOT_FOUND', 'Property not found');
  }
  res.json(property);
});

/**
 * GET /properties/:id/history
 * Get foreclosure event timeline (Mocked).
 */
app.get(`${API_PREFIX}/properties/:id/history`, (req: any, res: any) => {
  const property = propertiesDB.find(p => p.id === req.params.id);
  if (!property) {
    return sendError(res, 404, 'NOT_FOUND', 'Property not found');
  }

  // Mock history data based on the current listing
  const history = [
    {
      date: property.foreclosure.sale_date || new Date().toISOString(),
      event: "Current Listing",
      source: property.source.source_name,
      status_text: property.foreclosure.status
    },
    {
      date: "2023-01-15",
      event: "Lis Pendens Filed",
      source: "Public Records",
      status_text: "NOD"
    }
  ];

  res.json(history);
});

/**
 * POST /properties/:id/analyze
 * Trigger real-time AI analysis.
 */
app.post(`${API_PREFIX}/properties/:id/analyze`, async (req: any, res: any) => {
  const propertyIndex = propertiesDB.findIndex(p => p.id === req.params.id);
  if (propertyIndex === -1) {
    return sendError(res, 404, 'NOT_FOUND', 'Property not found');
  }

  const property = propertiesDB[propertyIndex];

  try {
    // Call the AI Service
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
app.get(`${API_PREFIX}/saved-searches`, (req: any, res: any) => {
  res.json(savedSearchesDB);
});

/**
 * POST /saved-searches
 */
app.post(`${API_PREFIX}/saved-searches`, (req: any, res: any) => {
  const { name, filters, alerts_enabled } = req.body;
  
  if (!name || !filters) {
    return sendError(res, 400, 'BAD_REQUEST', 'Missing name or filters');
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
app.get(`${API_PREFIX}/saved-searches/:id/results`, (req: any, res: any) => {
  const search = savedSearchesDB.find(s => s.id === req.params.id);
  if (!search) {
    return sendError(res, 404, 'NOT_FOUND', 'Saved search not found');
  }

  // Simplified logic: Just re-using the filter parameters logic would be ideal here.
  // For the skeleton, we redirect or just return all for demo.
  // In a real app, we would translate search.filters into a SQL WHERE clause.
  res.json({
    data: propertiesDB, // Mock return
    meta: { count: propertiesDB.length, filter_applied: search.name }
  });
});

// =============================================================================
// 3. Ingestion & Export
// =============================================================================

/**
 * POST /ingest
 * Handle CSV upload or Trigger Scrapers.
 */
app.post(`${API_PREFIX}/ingest`, upload.single('file') as any, (req: any, res: any) => {
  const { source_type, adapter_id } = req.body;

  if (source_type === 'excel_import' && req.file) {
    try {
      const csvContent = req.file.buffer.toString('utf-8');
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
    // Logic to trigger background worker for adapter_id
    res.json({ message: `Scraper ${adapter_id} triggered successfully. Check logs for progress.` });
  } else {
    sendError(res, 400, 'BAD_REQUEST', 'Invalid source_type or missing file');
  }
});

/**
 * GET /export
 * Export current view to CSV.
 */
app.get(`${API_PREFIX}/export`, (req: any, res: any) => {
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
  app.get('*', (req, res) => {
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
