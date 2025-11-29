import React from 'react';
import { PropertyListing } from '../types';
import { BAND_COLORS } from '../constants';
import { Calendar, ExternalLink, AlertTriangle } from 'lucide-react';
import EquityGauge from './EquityGauge';

interface PropertyCardProps {
  property: PropertyListing;
  onClick?: () => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, onClick }) => {
  const { address, foreclosure, valuation, ai_analysis, source } = property;
  
  const riskColorClass = ai_analysis.risk_band ? BAND_COLORS[ai_analysis.risk_band as keyof typeof BAND_COLORS] : BAND_COLORS.Unknown;
  
  // Extract just the color for the border (a bit hacky, but works with Tailwind classes provided)
  // bg-emerald-100 -> border-emerald-500
  let riskBorderColor = "border-slate-300";
  if (ai_analysis.risk_band === 'Low') riskBorderColor = "border-t-emerald-500";
  else if (ai_analysis.risk_band === 'Moderate') riskBorderColor = "border-t-amber-500";
  else if (ai_analysis.risk_band === 'High') riskBorderColor = "border-t-red-500";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <article 
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-labelledby={`property-address-${property.id}`}
      className={`bg-white rounded-xl shadow-sm border border-slate-200 border-t-4 ${riskBorderColor} hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
        <div className="overflow-hidden">
          <h3 
            id={`property-address-${property.id}`} 
            className="font-bold text-slate-900 truncate text-lg" 
            title={address.full}
          >
            {address.street}
          </h3>
          <p className="text-sm text-slate-500 truncate">{address.city}, {address.state} {address.zip}</p>
        </div>
        <span 
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${riskColorClass}`}
          aria-label={`Risk Level: ${ai_analysis.risk_band || 'Unknown'}`}
        >
          {ai_analysis.risk_band?.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 space-y-5">
        
        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
           <div className="space-y-0.5">
             <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Est. Value</div>
             <div className="text-lg font-bold text-slate-800" aria-label={`Estimated Value: ${valuation.estimated_value ? '$' + valuation.estimated_value.toLocaleString() : 'N/A'}`}>
               {valuation.estimated_value ? `$${valuation.estimated_value.toLocaleString()}` : 'N/A'}
             </div>
           </div>
           <div className="space-y-0.5 text-right">
             <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Start Bid</div>
             <div className="text-lg font-bold text-slate-800" aria-label={`Opening Bid: ${foreclosure.opening_bid ? '$' + foreclosure.opening_bid.toLocaleString() : 'N/A'}`}>
               {foreclosure.opening_bid ? `$${foreclosure.opening_bid.toLocaleString()}` : 'N/A'}
             </div>
           </div>
        </div>

        {/* Equity Gauge Section */}
        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100 relative overflow-hidden" role="group" aria-label="Equity Information">
            <div className="flex flex-col z-10">
                <span className="text-xs text-slate-500 mb-1 font-medium">Potential Equity</span>
                <span className="text-xl text-emerald-600 font-extrabold tracking-tight">
                    {valuation.equity_amount ? `+$${(valuation.equity_amount / 1000).toFixed(0)}k` : 'N/A'}
                </span>
            </div>
            <div className="flex items-center justify-center -mt-6 -mr-4 transform scale-75 origin-top-right" aria-hidden="true">
                <EquityGauge value={valuation.equity_pct || 0} label="Spread" />
            </div>
        </div>

        {/* AI Insight */}
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wide">
                <AlertTriangle size={12} aria-hidden="true" />
                <span>AI Rationale ({ai_analysis.ai_score}/100)</span>
            </div>
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed h-8">
                {ai_analysis.ai_summary || "No analysis available."}
            </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500 mt-auto">
        <div className="flex items-center gap-1.5" aria-label={`Sale Date: ${foreclosure.sale_date ? new Date(foreclosure.sale_date).toLocaleDateString() : 'To Be Determined'}`}>
            <Calendar size={14} className="text-slate-400" aria-hidden="true" />
            <span className="font-medium">{foreclosure.sale_date ? new Date(foreclosure.sale_date).toLocaleDateString() : 'Date TBD'}</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="capitalize px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-medium text-[10px]">
                {foreclosure.stage.replace('_', ' ')}
            </span>
            {source.source_url && (
                <a 
                  href={source.source_url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()} // Prevent card click
                  onKeyDown={(e) => e.stopPropagation()} // Prevent card keyboard activation
                  aria-label={`View source listing for ${address.street} on ${source.source_name || 'external site'}`}
                >
                    <ExternalLink size={14} aria-hidden="true" />
                </a>
            )}
        </div>
      </div>
    </article>
  );
};

export default PropertyCard;