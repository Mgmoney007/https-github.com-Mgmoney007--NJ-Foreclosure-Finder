
import React, { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { PropertyListing } from '../types';

interface MapViewProps {
  properties: PropertyListing[];
  onSelectProperty: (property: PropertyListing) => void;
}

const MapView: React.FC<MapViewProps> = ({ properties, onSelectProperty }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    // Initialize Map
    // Default center to NJ
    const map = L.map(mapContainer.current).setView([40.2, -74.5], 8);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    mapInstance.current = map;
    markersLayer.current = L.layerGroup().addTo(map);

    // Cleanup
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current) return;

    // Clear existing markers
    markersLayer.current.clearLayers();

    const bounds = L.latLngBounds([]);
    let hasMarkers = false;

    properties.forEach((prop) => {
      if (prop.address.lat && prop.address.lng) {
        hasMarkers = true;
        const latLng = L.latLng(prop.address.lat, prop.address.lng);
        bounds.extend(latLng);

        // Determine color based on Risk Band
        let color = '#64748b'; // Unknown (Slate)
        if (prop.ai_analysis.risk_band === 'Low') color = '#10b981'; // Emerald
        else if (prop.ai_analysis.risk_band === 'Moderate') color = '#f59e0b'; // Amber
        else if (prop.ai_analysis.risk_band === 'High') color = '#ef4444'; // Red

        // Custom Marker
        const markerHtml = `
          <div style="
            background-color: ${color};
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        `;

        const icon = L.divIcon({
          className: 'custom-map-marker',
          html: markerHtml,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker(latLng, { icon }).addTo(markersLayer.current!);
        
        // Popup and Click Event
        const popupContent = `
          <div class="p-2 min-w-[200px]">
            <div class="font-bold text-slate-800 text-sm mb-1">${prop.address.street}</div>
            <div class="text-xs text-slate-500 mb-2">${prop.address.city}, ${prop.address.zip}</div>
            <div class="flex justify-between items-center text-xs">
              <span class="font-semibold text-slate-700">$${(prop.valuation.estimated_value || 0).toLocaleString()}</span>
              <span class="px-2 py-0.5 rounded-full text-white text-[10px] font-bold" style="background-color: ${color}">
                ${prop.ai_analysis.risk_band?.toUpperCase()}
              </span>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => onSelectProperty(prop));
        marker.on('mouseover', function (this: L.Marker) { this.openPopup(); });
      }
    });

    // Fit bounds if markers exist
    if (hasMarkers && mapInstance.current) {
      mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [properties, onSelectProperty]);

  return (
    <div className="w-full h-[600px] bg-slate-100 rounded-xl overflow-hidden shadow-sm border border-slate-200 relative z-0">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
};

export default MapView;
