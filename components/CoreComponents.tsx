
import React, { useState } from 'react';
import { PropertyListing, NormalizedStage, RiskBand } from '../types';
import { 
  X, Search, Filter, AlertTriangle, CheckCircle, Calendar, 
  DollarSign, ArrowRight, TrendingUp, MapPin, Loader2 
} from 'lucide-react';
import { BAND_COLORS } from '../constants';
import EquityGauge from './EquityGauge';

// --- Types & Interfaces ---

export interface SearchFilters {
  q: string;
  minEquity: number;
  stages: NormalizedStage[];
  location: string;
}

interface SearchFormProps {
  currentFilters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
}

interface DealsTableProps {
  properties: PropertyListing[];
  onSelectProperty: (property: PropertyListing) => void;
  isLoading?: boolean;
}

interface PropertyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  property: PropertyListing | null;
  onAnalyze?: (id: string) => Promise<void>; // Handler for AI button
}

// --- 1. SearchForm (FilterToolbar) ---

export const SearchForm: React.FC<SearchFormProps> = ({ currentFilters, onFilterChange }) => {
  const handleChange = (key: keyof SearchFilters, value: any) => {
    onFilterChange({ ...currentFilters, [key]: value });
  };

  const toggleStage = (stage: NormalizedStage) => {
    const current = currentFilters.stages;
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage];
    handleChange('stages', next);
  };

  return (
    <div className="bg-white border-b border-slate-200 p-4 sticky top-16 z-20 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 items-center justify-between">
        
        {/* Text Search & Location */}
        <div className="flex flex-1 gap-2 w-full lg:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search address, defendant..." 
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={currentFilters.q}
              onChange={(e) => handleChange('q', e.target.value)}
            />
          </div>
          <div className="relative w-48 hidden sm:block">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="City or County" 
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={currentFilters.location}
              onChange={(e) => handleChange('location', e.target.value)}
            />
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end overflow-x-auto">
          
          {/* Equity Slider */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Min Equity: <span className="text-emerald-600">{currentFilters.minEquity}%</span>
            </span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="5"
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              value={currentFilters.minEquity}
              onChange={(e) => handleChange('minEquity', parseInt(e.target.value))}
            />
          </div>

          <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>

          {/* Stage Toggles */}
          <div className="flex items-center gap-1">
            {[NormalizedStage.SHERIFF_SALE, NormalizedStage.REO, NormalizedStage.AUCTION].map(stage => {
               const isActive = currentFilters.stages.includes(stage);
               return (
                 <button
                   key={stage}
                   onClick={() => toggleStage(stage)}
                   className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                     isActive 
                       ? 'bg-blue-50 text-blue-700 border-blue-200' 
                       : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                   }`}
                 >
                   {stage.replace('_', ' ').toUpperCase()}
                 </button>
               );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 2. DealsTable (PropertyFeed) ---

export const DealsTable: React.FC<DealsTableProps> = ({ properties, onSelectProperty, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-lg border border-slate-200 border-dashed m-6">
        <p className="text-slate-500">No properties match your filters.</p>
        <button className="mt-2 text-blue-600 text-sm font-medium hover:underline">Clear Filters</button>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
            <tr>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">City / Zip</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Sale Date</th>
              <th className="px-4 py-3 text-right">Est. Value</th>
              <th className="px-4 py-3 text-right">Equity %</th>
              <th className="px-4 py-3 text-center">AI Risk</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((p) => {
              const riskColor = p.ai_analysis.risk_band 
                ? BAND_COLORS[p.ai_analysis.risk_band as keyof typeof BAND_COLORS] 
                : BAND_COLORS.Unknown;
                
              const equity = p.valuation.equity_pct || 0;
              const equityColor = equity >= 25 ? "text-emerald-600" : equity >= 10 ? "text-amber-600" : "text-red-500";

              return (
                <tr 
                  key={p.id} 
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  onClick={() => onSelectProperty(p)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate" title={p.address.full}>
                    {p.address.street}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.address.city}, {p.address.zip}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 capitalize">
                      {p.foreclosure.stage.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.foreclosure.sale_date ? new Date(p.foreclosure.sale_date).toLocaleDateString() : 'TBD'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {p.valuation.estimated_value ? `$${(p.valuation.estimated_value / 1000).toFixed(0)}k` : '-'}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${equityColor}`}>
                    {p.valuation.equity_pct !== null ? `${p.valuation.equity_pct.toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${riskColor}`}>
                      {p.ai_analysis.risk_band}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-blue-600">
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- 3. PropertyDrawer (Slide-over Details) ---

export const PropertyDrawer: React.FC<PropertyDrawerProps> = ({ isOpen, onClose, property, onAnalyze }) => {
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyzeClick = async () => {
    if (!property || !onAnalyze) return;
    setAnalyzing(true);
    await onAnalyze(property.id);
    setAnalyzing(false);
  };

  if (!isOpen || !property) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full overflow-y-auto flex flex-col animate-slide-in-right">
        
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{property.address.full}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <span className="capitalize px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">
                {property.foreclosure.stage.replace('_', ' ')}
              </span>
              <span>•</span>
              <span>{property.address.county} County</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          
          {/* 1. Valuation Section (The Money) */}
          <section className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Est. Resale Value</span>
              <div className="text-2xl font-bold text-slate-900 flex items-center gap-1">
                <DollarSign size={20} className="text-slate-400" />
                {property.valuation.estimated_value?.toLocaleString() || "N/A"}
              </div>
            </div>
            <div className="space-y-1 text-right">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Spread (Equity)</span>
              <div className="text-2xl font-bold text-emerald-600">
                 +${property.valuation.equity_amount?.toLocaleString() || "0"}
              </div>
              <div className="text-xs font-medium text-emerald-700">
                {property.valuation.equity_pct?.toFixed(1)}% margin
              </div>
            </div>
          </section>

          {/* 2. AI Analysis Panel */}
          <section className="space-y-3">
             <div className="flex items-center justify-between">
               <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                 <AlertTriangle size={18} className="text-indigo-600" />
                 AI Risk Analysis
               </h3>
               <button 
                 onClick={handleAnalyzeClick}
                 disabled={analyzing}
                 className="text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
               >
                 {analyzing ? "Thinking..." : "Refresh Analysis"}
               </button>
             </div>
             
             <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                
                <div className="flex items-start gap-4">
                   <div className="flex-shrink-0 pt-1">
                     <div className="w-12 h-12 rounded-full border-4 border-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 bg-white">
                        {property.ai_analysis.ai_score ?? "?"}
                     </div>
                   </div>
                   <div className="space-y-2">
                     <div className="flex items-center gap-2">
                       <span className={`px-2 py-0.5 rounded text-xs font-bold border ${BAND_COLORS[property.ai_analysis.risk_band as keyof typeof BAND_COLORS] || BAND_COLORS.Unknown}`}>
                          {property.ai_analysis.risk_band} RISK
                       </span>
                     </div>
                     <p className="text-sm text-slate-700 leading-relaxed">
                       {property.ai_analysis.rationale || "No detailed rationale available. Click refresh to generate."}
                     </p>
                     <div className="pt-2">
                       <p className="text-xs font-medium text-slate-500 uppercase">Executive Summary</p>
                       <p className="text-sm text-slate-600 italic">"{property.ai_analysis.ai_summary}"</p>
                     </div>
                   </div>
                </div>
             </div>
          </section>

          {/* 3. Foreclosure Details */}
          <section className="space-y-3">
             <h3 className="font-semibold text-slate-800 flex items-center gap-2">
               <Calendar size={18} className="text-slate-500" />
               Foreclosure Details
             </h3>
             <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                <div className="p-3 flex justify-between">
                  <span className="text-sm text-slate-500">Sale Date</span>
                  <span className="text-sm font-medium text-slate-900">
                    {property.foreclosure.sale_date ? new Date(property.foreclosure.sale_date).toDateString() : "TBD"}
                  </span>
                </div>
                <div className="p-3 flex justify-between">
                  <span className="text-sm text-slate-500">Opening Bid</span>
                  <span className="text-sm font-medium text-slate-900">
                    ${property.foreclosure.opening_bid?.toLocaleString() || "N/A"}
                  </span>
                </div>
                <div className="p-3 flex justify-between">
                  <span className="text-sm text-slate-500">Defendant (Owner)</span>
                  <span className="text-sm font-medium text-slate-900 text-right max-w-[200px] truncate">
                    {property.foreclosure.defendant || "Unknown"}
                  </span>
                </div>
                <div className="p-3 flex justify-between">
                  <span className="text-sm text-slate-500">Occupancy</span>
                  <span className="text-sm font-medium text-slate-900">
                    {property.occupancy || "Unknown"}
                  </span>
                </div>
                 <div className="p-3 flex justify-between">
                  <span className="text-sm text-slate-500">Source</span>
                  <a href={property.source.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline truncate max-w-[200px]">
                    {property.source.source_name}
                  </a>
                </div>
             </div>
          </section>

          {/* 4. Notes / Internal */}
          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">Internal Notes</h3>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800">
               {property.notes || "No notes added."}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
