import React, { useState, useEffect, useCallback } from 'react';
import { APP_NAME, MOCK_CSV_DATA } from './constants';
import { PropertyListing } from './types';
import { ingestCSVData } from './services/dataService';
import Dashboard from './components/Dashboard';
import SavedSearches from './components/SavedSearches';
import { SearchFilters } from './components/CoreComponents';
import { Building2, Search, Bell, Menu } from 'lucide-react';

type ViewMode = 'grid' | 'list' | 'map';
type Page = 'dashboard' | 'saved_searches';

const App: React.FC = () => {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation State
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Shared Filter State
  const [filters, setFilters] = useState<SearchFilters>({
    q: '',
    minEquity: 0,
    stages: [],
    location: ''
  });

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
        const res = await fetch('/api/v1/properties?limit=100');
        if (res.ok) {
            const json = await res.json();
            setProperties(json.data);
        } else {
            throw new Error("API not available");
        }
    } catch (err) {
        console.warn("API fetch failed, falling back to local ingestion (Mock Data):", err);
        const data = ingestCSVData(MOCK_CSV_DATA);
        setProperties(data);
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Handlers for Navigation
  const handleNavToDashboard = () => {
    setActivePage('dashboard');
    setViewMode('grid'); // Reset to default view
  };

  const handleNavToMap = () => {
    setActivePage('dashboard');
    setViewMode('map');
  };

  const handleNavToSaved = () => {
    setActivePage('saved_searches');
  };

  const handleLoadSavedSearch = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setActivePage('dashboard'); // Switch back to dashboard to see results
    setViewMode('grid');
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      
      {/* Navigation Bar */}
      <nav className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={handleNavToDashboard}>
                <div className="bg-blue-600 p-1.5 rounded-lg">
                    <Building2 size={24} className="text-white" />
                </div>
                <span className="font-bold text-xl tracking-tight">{APP_NAME}</span>
            </div>
            
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <button 
                  onClick={handleNavToDashboard}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activePage === 'dashboard' && viewMode !== 'map'
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  Dashboard
                </button>
                <button 
                  onClick={handleNavToMap}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activePage === 'dashboard' && viewMode === 'map'
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  Map View
                </button>
                <button 
                  onClick={handleNavToSaved}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activePage === 'saved_searches'
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  Saved Searches
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
                <button className="text-slate-400 hover:text-white">
                    <Search size={20} />
                </button>
                <button className="text-slate-400 hover:text-white relative">
                    <Bell size={20} />
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
                </button>
                <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold border-2 border-slate-700">
                    JD
                </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {loading ? (
            <div className="flex flex-col items-center justify-center h-[80vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-slate-500 font-medium">Loading Market Data...</p>
                <p className="text-slate-400 text-sm mt-2">Normalizing schemas & calculating equity spreads</p>
            </div>
        ) : (
            <>
                {activePage === 'dashboard' ? (
                    <Dashboard 
                        properties={properties} 
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        filters={filters}
                        setFilters={setFilters}
                        onRefresh={fetchProperties}
                    />
                ) : (
                    <SavedSearches onLoadSearch={handleLoadSavedSearch} />
                )}
            </>
        )}
      </main>

    </div>
  );
};

export default App;