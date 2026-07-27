import type { PopItem } from "./types";

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
  if (!source || !useProxy || !source.includes("images.hobbydb.com")) return source;
  return `https://wsrv.nl/?url=${encodeURIComponent(source)}&w=520&h=520&fit=contain&we`;
}

export function marketQuery(item: Pick<PopItem, "name" | "number" | "series">): string {
  return ["Funko Pop", item.name, item.number ? `#${item.number}` : "", item.series && item.series !== "Unsorted" ? item.series : ""]
    .filter(Boolean)
    .join(" ");
}

export function marketLinks(item: Pick<PopItem, "name" | "number" | "series">) {
  const query = marketQuery(item);
  const encoded = encodeURIComponent(query);
  return {
    priceCharting: `https://www.pricecharting.com/search-products?type=prices&q=${encoded}`,
    ebay: `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1`,
    tradeMe: `https://www.trademe.co.nz/a/marketplace/search?search_string=${encoded}`,
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
    "Status", "Category", "Name", "Number", "Series", "Quantity", "Condition", "Location",
    `Purchase price (${currency})`, `Estimated value (${currency})`, `Asking price (${currency})`,
    "Valuation source", "Valued at", "Favourite", "Comments", "Source sheet",
  ];
  const rows = items.map((item) => [
    item.status, item.category, item.name, item.number, item.series, item.quantity, item.condition,
    item.location, item.purchasePrice, item.estimatedValue, item.askingPrice, item.valuationSource,
    item.valuedAt, item.favorite ? "yes" : "no", item.comments, item.sourceRef,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function parsePrice(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
