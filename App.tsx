import React, { useState, useEffect } from 'react';
import { APP_NAME, MOCK_CSV_DATA } from './constants';
import { PropertyListing } from './types';
import { ingestCSVData } from './services/dataService';
import Dashboard from './components/Dashboard';
import { Building2, Search, Bell, Menu } from 'lucide-react';

const App: React.FC = () => {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API fetch delay
    setTimeout(() => {
        const data = ingestCSVData(MOCK_CSV_DATA);
        setProperties(data);
        setLoading(false);
    }, 800);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      
      {/* Navigation Bar */}
      <nav className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-1.5 rounded-lg">
                    <Building2 size={24} className="text-white" />
                </div>
                <span className="font-bold text-xl tracking-tight">{APP_NAME}</span>
            </div>
            
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <a href="#" className="bg-slate-800 text-white px-3 py-2 rounded-md text-sm font-medium">Dashboard</a>
                <a href="#" className="text-slate-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Map View</a>
                <a href="#" className="text-slate-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Saved Searches</a>
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
            <Dashboard properties={properties} />
        )}
      </main>

    </div>
  );
};

export default App;