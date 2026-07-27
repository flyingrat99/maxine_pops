import type { PopItem, ProductInfoResponse } from "./types";

export const statusLabels = {
  owned: "Collection",
  wishlist: "Wishlist",
  sale: "For sale",
} as const;

export const conditionOptions = ["Mint", "Near mint", "Good", "Box damaged", "Out of box"] as const;

export function createLocalId(prefix = "custom"): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // LAN-hosted HTTP pages may expose crypto without allowing randomUUID.
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/spider[- ]?man/g, "spider man")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractFunkoItemNumber(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, "");
  const skuMatch = compact.match(/^(?:FUN|FK)(\d{4,6})$/);
  if (skuMatch) return skuMatch[1];

  const digits = compact.replace(/\D/g, "");
  const upc = digits.length === 13 && digits.startsWith("0") ? digits.slice(1) : digits;
  const barcodeMatch = upc.match(/^889698(\d{5})(\d)$/);
  if (barcodeMatch) return barcodeMatch[1];
  return /^\d{4,6}$/.test(digits) ? digits : "";
}

export function formatMoney(value: number | null | undefined, currency = "NZD"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function getImageUrl(item: PopItem, useProxy = true): string {
  const source = item.customImageUrl || item.catalogMatch?.imageUrl || "";
  if (item.customImageUrl && !/\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(source)) {
    return `/api/images/preview?url=${encodeURIComponent(source)}`;
  }
  if (!source || !useProxy || !source.includes("images.hobbydb.com")) return source;
  return `https://wsrv.nl/?url=${encodeURIComponent(source)}&w=520&h=520&fit=contain&we`;
}

type MarketQueryItem = Pick<PopItem, "name" | "number" | "series" | "sku" | "upc">;

export function marketQuery(item: MarketQueryItem, source: "general" | "ebay" | "trademe" | "pricecharting" = "general"): string {
  const sku = String(item.sku || "").trim();
  const upc = String(item.upc || "").replace(/\D/g, "");
  const base = ["Funko Pop", item.name, item.number ? `#${item.number}` : "", item.series && item.series !== "Unsorted" ? item.series : ""].filter(Boolean);
  if (source === "pricecharting" && upc) return upc;
  if (source === "ebay" && upc) return ["Funko", item.name, upc].filter(Boolean).join(" ");
  if (source === "trademe") return [...base, sku].filter(Boolean).join(" ");
  return [...base, sku, upc].filter(Boolean).join(" ");
}

export function marketLinks(item: MarketQueryItem) {
  const priceChartingQuery = encodeURIComponent(marketQuery(item, "pricecharting"));
  const ebayQuery = encodeURIComponent(marketQuery(item, "ebay"));
  const tradeMeQuery = encodeURIComponent(marketQuery(item, "trademe"));
  return {
    priceCharting: `https://www.pricecharting.com/search-products?type=prices&q=${priceChartingQuery}`,
    ebay: `https://www.ebay.com/sch/i.html?_nkw=${ebayQuery}&LH_Sold=1&LH_Complete=1`,
    tradeMe: `https://www.trademe.co.nz/a/marketplace/search?search_string=${tradeMeQuery}`,
  };
}

export function downloadFile(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function makeCsv(items: PopItem[], currency: string): string {
  const headers = [
    "Status", "Category", "Name", "Number", "Series", "SKU / item ID", "UPC / EAN", "Quantity", "Condition", "Location",
    `Purchase price (${currency})`, `Estimated value (${currency})`, `Asking price (${currency})`,
    "Valuation source", "Valued at", "Reference currency", "Out-of-box price", "Damaged-box price", "New-in-box price",
    "Release date", "Description", "Information sources", "Favourite", "Comments", "Source sheet",
  ];
  const rows = items.map((item) => [
    item.status, item.category, item.name, item.number, item.series, item.sku, item.upc, item.quantity, item.condition,
    item.location, item.purchasePrice, item.estimatedValue, item.askingPrice, item.valuationSource,
    item.valuedAt, item.referencePrices?.currency, item.referencePrices?.outOfBox, item.referencePrices?.damagedBox,
    item.referencePrices?.newInBox, item.releaseDate, item.description,
    item.infoSources.map((source) => `${source.name}: ${source.url}`).join(" | "),
    item.favorite ? "yes" : "no", item.comments, item.sourceRef,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function mergeProductInfo(item: PopItem, result: ProductInfoResponse, replaceIdentity = false): PopItem {
  const suggestion = result.suggestion;
  if (!suggestion) return { ...item, infoCheckedAt: result.checkedAt };
  if (!replaceIdentity && suggestion.confidence < 0.9) return { ...item, infoCheckedAt: result.checkedAt };
  const currentSeriesIsPlaceholder = !item.series || ["unsorted", "wishlist", "marvel wishlist"].includes(item.series.toLowerCase());
  const sources = [...suggestion.infoSources, ...item.infoSources].filter((source, index, all) =>
    all.findIndex((candidate) => candidate.url === source.url) === index
  );
  return {
    ...item,
    name: replaceIdentity && suggestion.name ? suggestion.name : item.name || suggestion.name,
    number: replaceIdentity && suggestion.number ? suggestion.number : item.number || suggestion.number,
    series: (replaceIdentity && currentSeriesIsPlaceholder && suggestion.series) || item.series || suggestion.series,
    sku: suggestion.sku || item.sku,
    upc: suggestion.upc || item.upc,
    description: suggestion.description || item.description,
    releaseDate: suggestion.releaseDate || item.releaseDate,
    customImageUrl: item.customImageUrl || suggestion.imageUrl,
    referencePrices: suggestion.referencePrices || item.referencePrices,
    infoSources: sources,
    infoCheckedAt: result.checkedAt,
  };
}

export function parsePrice(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
