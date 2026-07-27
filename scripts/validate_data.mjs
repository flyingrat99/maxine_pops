import { readFile } from "node:fs/promises";

const seed = JSON.parse(await readFile(new URL("../src/data/seed.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await readFile(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();
const validStatuses = new Set(["owned", "wishlist", "sale"]);
const validCategories = new Set(["Marvel", "Others"]);

for (const [index, item] of seed.items.entries()) {
  if (!item.id || ids.has(item.id)) errors.push(`Row ${index + 1} has a missing or duplicate id.`);
  ids.add(item.id);
  if (!String(item.name || "").trim()) errors.push(`Row ${index + 1} has no name.`);
  if (!validStatuses.has(item.status)) errors.push(`Row ${index + 1} has invalid status ${item.status}.`);
  if (!validCategories.has(item.category)) errors.push(`Row ${index + 1} has invalid category ${item.category}.`);
  if (typeof item.sku !== "string" || typeof item.upc !== "string") errors.push(`Row ${index + 1} has invalid SKU or UPC fields.`);
  if (item.upc && !/^\d{8,14}$/.test(item.upc)) errors.push(`Row ${index + 1} has an invalid UPC/EAN barcode.`);
  if (!Number.isInteger(item.quantity) || item.quantity < 1) errors.push(`Row ${index + 1} has invalid quantity.`);
  if (item.catalogMatch && !item.catalogMatch.imageUrl) errors.push(`Row ${index + 1} has an image match without a URL.`);
}

if (!Array.isArray(catalog) || catalog.length < 10_000) errors.push("Filtered open catalog is unexpectedly small.");
if (seed.items.filter((item) => item.status === "owned").length < 900) errors.push("Collection import is unexpectedly small.");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const counts = Object.groupBy(seed.items, (item) => item.status);
  console.log(`Validated ${seed.items.length.toLocaleString()} records and ${catalog.length.toLocaleString()} catalog entries.`);
  console.log(`Collection ${counts.owned?.length ?? 0} · Wishlist ${counts.wishlist?.length ?? 0} · For sale ${counts.sale?.length ?? 0}`);
}
