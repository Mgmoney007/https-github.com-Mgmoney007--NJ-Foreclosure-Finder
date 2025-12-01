import React, { useEffect, useState } from 'react';
import { SavedSearch } from '../types';
import { SearchFilters } from './CoreComponents';
import { Play, Clock, MapPin, DollarSign, Layers, Loader2 } from 'lucide-react';

interface SavedSearchesProps {
  onLoadSearch: (filters: SearchFilters) => void;
}

const SavedSearches: React.FC<SavedSearchesProps> = ({ onLoadSearch }) => {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSearches = async () => {
        try {
            // Try relative path first
            let res = await fetch('/api/v1/saved-searches').catch(() => null);
            
            // Fallback to explicit localhost
            if (!res || !res.ok) {
                res = await fetch('http://localhost:3001/api/v1/saved-searches').catch(() => null);
            }

            if (!res || !res.ok) throw new Error("Failed to load searches");
            
            const data = await res.json();
            setSearches(data);
            setLoading(false);
        } catch (err) {
            console.error(err);
            // Fallback mock data if API fails (for demo resilience)
            setSearches([
                {
                    id: "mock-1",
                    name: "Hudson County Flips (Fallback)",
                    filters: {
                        county: "Hudson",
                        min_equity_pct: 20,
                        stages: []
                    },
                    alerts_enabled: true,
                    created_at: new Date().toISOString()
                }
            ]);
            setLoading(false);
        }
    };

    fetchSearches();
  }, []);

  const handleApply = (search: SavedSearch) => {
    // Map API saved search structure to UI SearchFilters
    const uiFilters: SearchFilters = {
      q: '',
      minEquity: search.filters.min_equity_pct || 0,
      stages: search.filters.stages || [],
      location: search.filters.cities?.[0] || search.filters.county || search.filters.city || ''
    };
    onLoadSearch(uiFilters);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400 mb-2" size={32} />
        <p className="text-slate-500">Loading saved searches...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Saved Searches</h1>
            <p className="text-slate-500 mt-1">Manage your alerts and quick-access filters.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {searches.map(search => (
          <div key={search.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-lg text-slate-800">{search.name}</h3>
                {search.alerts_enabled && (
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wide rounded-full border border-green-200">
                        Alerts On
                    </span>
                )}
              </div>
              
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                {search.filters.county || search.filters.city ? (
                    <div className="flex items-center gap-1">
                        <MapPin size={14} className="text-slate-400" />
                        <span>{search.filters.city || search.filters.county}</span>
                    </div>
                ) : null}
                
                {search.filters.min_equity_pct ? (
                    <div className="flex items-center gap-1">
                        <DollarSign size={14} className="text-slate-400" />
                        <span>&gt; {search.filters.min_equity_pct}% Equity</span>
                    </div>
                ) : null}

                {search.filters.stages && search.filters.stages.length > 0 ? (
                    <div className="flex items-center gap-1">
                        <Layers size={14} className="text-slate-400" />
                        <span className="capitalize">{search.filters.stages.join(', ').replace(/_/g, ' ')}</span>
                    </div>
                ) : null}
              </div>
              
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Clock size={12} />
                <span>Created {new Date(search.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <button 
              onClick={() => handleApply(search)}
              className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              <Play size={16} />
              Run Search
            </button>
          </div>
        ))}

        {searches.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500">No saved searches found.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default SavedSearches;