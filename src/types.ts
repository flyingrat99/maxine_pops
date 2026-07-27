export type Category = "Marvel" | "Others";
export type ItemStatus = "owned" | "wishlist" | "sale";
export type Condition = "Mint" | "Near mint" | "Good" | "Box damaged" | "Out of box";

export interface CatalogMatch {
  title: string;
  imageUrl: string;
  series: string[];
  confidence: number;
}

export interface ReferencePrices {
  currency: string;
  outOfBox: number | null;
  damagedBox: number | null;
  newInBox: number | null;
  source: string;
  sourceUrl: string;
  checkedAt: string;
}

export interface InfoSource {
  name: string;
  url: string;
  checkedAt: string;
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
  sku: string;
  upc: string;
  description: string;
  releaseDate: string;
  referencePrices: ReferencePrices | null;
  infoSources: InfoSource[];
  infoCheckedAt: string;
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

export interface ProductInfoSuggestion {
  name: string;
  number: string;
  series: string;
  sku: string;
  upc: string;
  description: string;
  releaseDate: string;
  imageUrl: string;
  referencePrices: ReferencePrices | null;
  infoSources: InfoSource[];
  confidence: number;
}

export interface ProductInfoStage {
  source: string;
  status: "matched" | "searched" | "unavailable";
  message: string;
  url: string;
}

export interface ProductInfoResponse {
  suggestion: ProductInfoSuggestion | null;
  stages: ProductInfoStage[];
  checkedAt: string;
  links: {
    priceCharting: string;
    ebay: string;
    tradeMe: string;
  };
}

export type PageId = "dashboard" | "collection" | "wishlist" | "sale" | "gaps" | "finder" | "backup" | "settings";
