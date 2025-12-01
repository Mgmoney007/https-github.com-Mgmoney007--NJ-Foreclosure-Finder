import React, { useMemo, useState } from 'react';
import { PropertyListing, NormalizedStage } from '../types';
import PropertyCard from './PropertyCard';
import MapView from './MapView';
import { SearchForm, DealsTable, PropertyDrawer, SearchFilters } from './CoreComponents';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowUpRight, DollarSign, LayoutGrid, List, Database, Map, RefreshCw } from 'lucide-react';

interface DashboardProps {
  properties: PropertyListing[];
  viewMode: 'grid' | 'list' | 'map';
  setViewMode: (mode: 'grid' | 'list' | 'map') => void;
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  onRefresh: () => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  properties: initialProperties,
  viewMode,
  setViewMode,
  filters,
  setFilters,
  onRefresh
}) => {
  // --- State ---
  // viewMode and filters lifted to App.tsx
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);

  // --- Filtering Logic ---
  const filteredProperties = useMemo(() => {
    return initialProperties.filter(p => {
      // 1. Text Search (Address or Defendant)
      const query = filters.q.toLowerCase();
      const matchesText = !query || 
        p.address.full.toLowerCase().includes(query) || 
        (p.foreclosure.defendant?.toLowerCase().includes(query) ?? false);

      // 2. Location
      const locQuery = filters.location.toLowerCase();
      const matchesLoc = !locQuery || 
        p.address.city.toLowerCase().includes(locQuery) || 
        p.address.county.toLowerCase().includes(locQuery);

      // 3. Min Equity
      const matchesEquity = (p.valuation.equity_pct || 0) >= filters.minEquity;

      // 4. Stages
      const matchesStage = filters.stages.length === 0 || 
        filters.stages.includes(p.foreclosure.stage as NormalizedStage);

      return matchesText && matchesLoc && matchesEquity && matchesStage;
    });
  }, [initialProperties, filters]);

  // --- Derived Stats (Based on Filtered Data) ---
  const stats = useMemo(() => {
    const total = filteredProperties.length;
    const highEquity = filteredProperties.filter(p => (p.valuation.equity_pct || 0) > 25).length;
    const totalPotValue = filteredProperties.reduce((acc, curr) => acc + (curr.valuation.estimated_value || 0), 0);
    
    // Chart Data
    const counts = {
      [NormalizedStage.PRE_FORECLOSURE]: 0,
      [NormalizedStage.SHERIFF_SALE]: 0,
      [NormalizedStage.AUCTION]: 0,
      [NormalizedStage.REO]: 0,
      [NormalizedStage.UNKNOWN]: 0,
    };
    filteredProperties.forEach(p => {
        const k = p.foreclosure.stage as NormalizedStage;
        if (counts[k] !== undefined) counts[k]++;
    });
    
    const chartData = Object.entries(counts).map(([name, value]) => ({ 
        name: name.replace('_', ' ').toUpperCase(), 
        value 
    }));

    return { total, highEquity, totalPotValue, chartData };
  }, [filteredProperties]);

  // --- Handlers ---
  const handleSelectProperty = (property: PropertyListing) => {
    setSelectedPropertyId(property.id);
  };

  const handleCloseDrawer = () => {
    setSelectedPropertyId(null);
  };

  const handleAIAnalyze = async (id: string) => {
    console.log(`Triggering AI analysis for ${id}`);
    try {
        // Attempt to call the backend API which handles the AI service and updates the DB
        let res = await fetch(`/api/v1/properties/${id}/analyze`, { method: 'POST' }).catch(() => null);
        
        // Fallback for dev environments
        if (!res || !res.ok) {
             res = await fetch(`http://localhost:3001/api/v1/properties/${id}/analyze`, { method: 'POST' }).catch(() => null);
        }
        
        if (res && res.ok) {
            // Refresh data to show new analysis from the server
            await onRefresh();
        } else {
            console.error("Analysis API failed");
        }
    } catch (e) {
        console.error("Analysis failed", e);
    }
  };

  const handleScrape = async () => {
    setIsScraping(true);
    try {
        const body = JSON.stringify({ 
                source_type: 'scraper_trigger',
                saved_search_id: 'search-001' 
            });
        const headers = { 'Content-Type': 'application/json' };

        // Attempt scrape trigger with fallback
        let res = await fetch('/api/v1/ingest', { method: 'POST', headers, body }).catch(() => null);
        
        if (!res || !res.ok) {
             res = await fetch('http://localhost:3001/api/v1/ingest', { method: 'POST', headers, body }).catch(() => null);
        }
        
        if (!res || !res.ok) throw new Error("Scrape failed to trigger");
        
        // Refresh data without page reload
        await onRefresh();
        
    } catch (err) {
        console.error("Scraping error:", err);
        alert("Failed to retrieve live data. Check server logs.");
    } finally {
        setIsScraping(false);
    }
  };

  const selectedProperty = useMemo(() => 
    filteredProperties.find(p => p.id === selectedPropertyId) || null
  , [filteredProperties, selectedPropertyId]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
        notation: "compact"
    }).format(val);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen pb-20">
      
      {/* Top Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-sm text-slate-500">Visible Listings</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Database size={20} />
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-sm text-slate-500">High Equity (>25%)</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.highEquity}</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                <ArrowUpRight size={20} />
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-sm text-slate-500">Est. Pipeline Value</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalPotValue)}</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                <DollarSign size={20} />
            </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-32 relative overflow-hidden min-w-0">
             {/* Small Bar Chart */}
            <p className="text-xs text-slate-400 absolute top-3 left-4 z-10">Stage Distribution</p>
            <div className="w-full h-full pt-8 px-2 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData}>
                      <XAxis dataKey="name" hide />
                      <Tooltip 
                          cursor={{fill: 'transparent'}}
                          contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {stats.chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#60a5fa', '#34d399', '#ffb74d', '#f87171', '#94a3b8'][index % 5]} />
                          ))}
                      </Bar>
                  </BarChart>
              </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* Main Toolbar & Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
               <h2 className="text-lg font-bold text-slate-800">Deal Finder</h2>
               <button 
                onClick={handleScrape}
                disabled={isScraping}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <RefreshCw size={16} className={isScraping ? "animate-spin" : ""} />
                 {isScraping ? "Scraping Live Data..." : "Refresh Data (Live Scrape)"}
               </button>
           </div>
           
           <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="List View"
              >
                <List size={18} />
              </button>
              <button 
                onClick={() => setViewMode('map')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Map View"
              >
                <Map size={18} />
              </button>
           </div>
        </div>

        <SearchForm currentFilters={filters} onFilterChange={setFilters} />
      </div>

      {/* Content Area */}
      {filteredProperties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
             <div className="bg-slate-50 p-4 rounded-full mb-4">
                <Database size={32} className="text-slate-300" />
             </div>
             <p className="text-slate-500 font-medium">No properties match your filters</p>
             <button 
               onClick={() => setFilters({ q: '', minEquity: 0, stages: [], location: '' })}
               className="mt-4 text-blue-600 text-sm font-medium hover:underline"
             >
               Reset all filters
             </button>
          </div>
      ) : (
        <>
          {viewMode === 'map' ? (
             <MapView 
               properties={filteredProperties} 
               onSelectProperty={handleSelectProperty} 
             />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProperties.map(property => (
                  <PropertyCard 
                    key={property.id} 
                    property={property} 
                    onClick={() => handleSelectProperty(property)}
                  />
              ))}
            </div>
          ) : (
            <DealsTable 
              properties={filteredProperties} 
              onSelectProperty={handleSelectProperty} 
            />
          )}
        </>
      )}

      {/* Details Drawer */}
      <PropertyDrawer 
        isOpen={!!selectedPropertyId} 
        onClose={handleCloseDrawer} 
        property={selectedProperty}
        onAnalyze={handleAIAnalyze}
      />

    </div>
  );
};

export default Dashboard;