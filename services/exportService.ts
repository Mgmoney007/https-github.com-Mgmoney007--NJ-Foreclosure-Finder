
import { PropertyListing } from '../types';

/**
 * Columns matching the original Excel tracker headers.
 */
const COLUMNS = [
  "Address",
  "Phone Number",
  "Home Owner",
  "Status",
  "Stage",
  "Auction Date",
  "Opening Bid",
  "Est. Value",
  "Source URL",
  "Occupancy",
  "Notes / Flags"
];

/**
 * Safe CSV Cell Escaping
 * Wraps content in quotes if it contains commas, quotes, or newlines.
 * Escapes internal quotes by doubling them.
 */
const escapeCsv = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

/**
 * Format helpers to mirror Excel visual style
 */
const formatCurrency = (val: number | null): string => {
  if (val === null) return "N/A";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val);
};

const formatDate = (isoString: string | null): string => {
  if (!isoString) return "";
  // Return YYYY-MM-DD for Excel compatibility
  return new Date(isoString).toISOString().split('T')[0];
};

const formatStage = (stage: string): string => {
  // Convert snake_case "sheriff_sale" to Title Case "Sheriff Sale"
  return stage
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Generates a CSV string from an array of PropertyListings.
 */
export const toTrackerCsv = (properties: PropertyListing[]): string => {
  // 1. Generate Header Row
  const headerRow = COLUMNS.join(",");

  // 2. Generate Data Rows
  const rows = properties.map(p => {
    const rowData = [
      // Address
      escapeCsv(p.address.full),
      
      // Phone Number
      escapeCsv(p.foreclosure.owner_phone || ""),
      
      // Home Owner (Defendant)
      escapeCsv(p.foreclosure.defendant),
      
      // Status (Raw)
      escapeCsv(p.foreclosure.status),
      
      // Stage (Formatted)
      escapeCsv(formatStage(p.foreclosure.stage)),
      
      // Auction Date
      escapeCsv(formatDate(p.foreclosure.sale_date)),
      
      // Opening Bid (Formatted as string with $)
      escapeCsv(formatCurrency(p.foreclosure.opening_bid)),
      
      // Est. Value (Formatted as string with $)
      escapeCsv(formatCurrency(p.valuation.estimated_value)),
      
      // Source URL
      escapeCsv(p.source.source_url),
      
      // Occupancy
      escapeCsv(p.occupancy),
      
      // Notes / Flags
      escapeCsv(p.notes)
    ];

    return rowData.join(",");
  });

  // 3. Combine
  return [headerRow, ...rows].join("\n");
};
