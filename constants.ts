
export const APP_NAME = "NJ Foreclosure Finder";

// Use Strategy Config for these values in logic, 
// these exports are for UI display defaults/fallbacks.
export const EQUITY_HOT_THRESHOLD = 25;
export const EQUITY_WATCHLIST_THRESHOLD = 15; // Updated to match Strategy minimum viable

// Color mapping for bands
export const BAND_COLORS = {
  Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Moderate: "bg-amber-100 text-amber-800 border-amber-200",
  High: "bg-red-100 text-red-800 border-red-200",
  Unknown: "bg-slate-100 text-slate-800 border-slate-200",
};

export const MOCK_CSV_DATA = `Address,Phone Number,Home Owner,Status,Stage,Auction Date,Opening Bid,Est. Value,Source URL,Occupancy,Notes / Flags
"123 Main St, Jersey City, NJ 07302",201-220-4000,Mr. John Smith,Pre-foreclosure,NOD Filed,N/A,N/A,"$265,000",https://www.foreclosure.com/123main,Occupied,1st lien only; lis pendens filed
"456 Oak Ave, Weehawken, NJ 07086",973-867-6000,Mr. and Mrs. William Johnson,REO,Bank-Owned,N/A,"$119,000","$160,000",https://www.hudhomestore.gov/456oak,Vacant,HUD resale; investor offer accepted
"789 Pine Rd, Hoboken, NJ 07030",917-988-2020,Donald and Donna Duck,Auction,Trustee Sale,2025-12-10,"$315,000","$420,000",https://www.auction.com/789pine,Unknown,Senior lien; cash only
"101 Maple Dr, Cherry Hill, NJ 08002",856-555-1234,Estate of Harold Green,Sheriff Sale,Scheduled,2024-11-15,"$150,000","$300,000",https://sheriff.camdencounty.com/101maple,Vacant,Major repairs needed; fire damage
"55 Ocean Blvd, Atlantic City, NJ 08401",609-555-9876,Casino Holdings LLC,Auction,Adjourned,2024-10-01,"$450,000","$400,000",https://www.auction.com/55ocean,Occupied,Negative equity; commercial zoning potential`;
