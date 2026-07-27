export type Category = "Marvel" | "Others";
export type ItemStatus = "owned" | "wishlist" | "sale";
export type Condition = "Mint" | "Near mint" | "Good" | "Box damaged" | "Out of box";

export interface CatalogMatch {
  title: string;
  imageUrl: string;
  series: string[];
  confidence: number;
}

export interface PopItem {
  id: string;
  name: string;
  number: string;
  series: string;
  category: Category;
  status: ItemStatus;
  quantity: number;
  condition: Condition;
  comments: string;
  funkoApp: string;
  hobbyDb: string;
  favorite: boolean;
  location: string;
  purchasePrice: number | null;
  estimatedValue: number | null;
  askingPrice: number | null;
  valuationSource: string;
  valuedAt: string;
  catalogMatch: CatalogMatch | null;
  customImageUrl: string;
  sourceRef: string;
  targetSeller?: string;
  targetPriceNote?: string;
}

export interface SeedData {
  schemaVersion: number;
  meta: {
    title: string;
    workbook: string;
    catalogProject: string;
    catalogCommit: string;
    catalogLastUpdated: string;
    includedSheets: string[];
    ignoredSheets: string[];
  };
  items: PopItem[];
}

export interface CatalogEntry {
  handle: string;
  title: string;
  imageUrl: string;
  series: string[];
}

export interface AppSettings {
  currency: "NZD" | "AUD" | "USD" | "GBP";
  imageProxy: boolean;
}

export interface TrackerState {
  schemaVersion: number;
  items: PopItem[];
  settings: AppSettings;
  lastSavedAt: string;
}

export interface ConnectionStatus {
  ebay: {
    configured: boolean;
    marketplace: string;
    label: string;
  };
  trademe: {
    configured: boolean;
    connected: boolean;
    environment: "production" | "sandbox";
    label: string;
  };
}

export interface MarketListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  url: string;
  condition: string;
  buyingOption: string;
}

export interface MarketSearchResponse {
  source: "ebay" | "trademe";
  query: string;
  total: number;
  listings: MarketListing[];
}

export type PageId = "dashboard" | "collection" | "wishlist" | "sale" | "gaps" | "backup" | "settings";
