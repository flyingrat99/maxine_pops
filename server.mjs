import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { hostname } from "node:os";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const distRoot = join(appRoot, "dist");
const portArgIndex = process.argv.indexOf("--port");
const parsedPort = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : Number(process.env.PORT);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 4173;
const hostArgIndex = process.argv.indexOf("--host");
const requestedHost = hostArgIndex >= 0 ? process.argv[hostArgIndex + 1] : process.env.HOST;
const bindHost = requestedHost && /^[a-zA-Z0-9.:[\]-]+$/.test(requestedHost) ? requestedHost : "127.0.0.1";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

const previewDomains = [
  "amazon.com.au", "ebay.co.uk", "ebay.com", "ebay.com.au", "funko.com", "hobbydb.com", "popcultcha.com.au",
  "pricecharting.com", "trademe.co.nz",
];
const previewCache = new Map();
const enrichmentCache = new Map();

function isAllowedPreviewHost(hostname) {
  const host = hostname.toLowerCase();
  return previewDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isAmazonHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "amazon.com.au" || host.endsWith(".amazon.com.au");
}

function decodeHtml(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1].toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function tagAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function jsonImage(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jsonImage).find(Boolean) || "";
  if (value && typeof value === "object") return jsonImage(value.url || value.contentUrl);
  return "";
}

function productImageFromJson(value, expectedSku = "") {
  const pending = [value];
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object") continue;
    const types = Array.isArray(current["@type"]) ? current["@type"] : [current["@type"]];
    if (types.some((type) => String(type).toLowerCase() === "product")) {
      const sku = String(current.sku || current.mpn || "");
      const image = jsonImage(current.image);
      if (image && (!expectedSku || sku === expectedSku)) return image;
    }
    if (Array.isArray(current)) pending.push(...current);
    else pending.push(...Object.values(current));
  }
  return "";
}

function productImageFromHtml(html, pageUrl, expectedSku = "") {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tagAttribute(tag, "property") || tagAttribute(tag, "name")).toLowerCase();
    if (!["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(key)) continue;
    const content = tagAttribute(tag, "content");
    if (content) return new URL(content, pageUrl).href;
  }

  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const image = productImageFromJson(JSON.parse(match[1].trim()), expectedSku);
      if (image) return new URL(decodeHtml(image), pageUrl).href;
    } catch {
      // Ignore malformed third-party structured data and try the next block.
    }
  }

  const host = new URL(pageUrl).hostname.toLowerCase();
  if (isAmazonHost(host)) {
    const imageTag = html.match(/<(?:img|div)\b[^>]*\bid=["']landingImage["'][^>]*>/i)?.[0] || "";
    const hires = tagAttribute(imageTag, "data-old-hires");
    if (hires) return new URL(hires, pageUrl).href;
    const source = tagAttribute(imageTag, "src");
    if (source) return new URL(source, pageUrl).href;
    const dynamic = tagAttribute(imageTag, "data-a-dynamic-image");
    if (dynamic) {
      try {
        const candidates = Object.entries(JSON.parse(dynamic));
        candidates.sort((left, right) => {
          const leftSize = Array.isArray(left[1]) ? Number(left[1][0]) * Number(left[1][1]) : 0;
          const rightSize = Array.isArray(right[1]) ? Number(right[1][0]) * Number(right[1][1]) : 0;
          return rightSize - leftSize;
        });
        if (candidates[0]?.[0]) return new URL(candidates[0][0], pageUrl).href;
      } catch {
        // Fall through to other product-page image metadata.
      }
    }
  }
  if (host === "pricecharting.com" || host.endsWith(".pricecharting.com")) {
    const largeImage = html.match(/<div\b[^>]*id=["']js-dialog-large-image["'][^>]*>[\s\S]{0,1200}?<img\b[^>]*>/i)?.[0] || "";
    const largeSource = tagAttribute(largeImage.match(/<img\b[^>]*>/i)?.[0] || "", "src");
    if (largeSource) return new URL(largeSource, pageUrl).href;
    const cover = html.match(/<div\b[^>]*class=["'][^"']*\bcover\b[^"']*["'][^>]*>[\s\S]{0,2500}?<img\b[^>]*>/i)?.[0] || "";
    const image = tagAttribute(cover.match(/<img\b[^>]*>/i)?.[0] || "", "src");
    if (image) return new URL(image, pageUrl).href;
  }
  return "";
}

async function fetchPreviewPage(initialUrl) {
  let current = initialUrl;
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    if (current.protocol !== "https:" || !isAllowedPreviewHost(current.hostname)) throw new Error("That product-page domain is not supported for image previews.");
    const result = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "Mozilla/5.0 (compatible; MaxinesPopTracker/1.0; product image preview)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const location = result.headers.get("location");
      if (!location) throw new Error("The product page returned an invalid redirect.");
      current = new URL(location, current);
      continue;
    }
    return { result, current };
  }
  throw new Error("The product page redirected too many times.");
}

async function resolveProductPageImage(rawUrl) {
  if (!rawUrl || rawUrl.length > 2_048) throw new Error("Enter a valid product-page URL.");
  const pageUrl = new URL(rawUrl);
  if (pageUrl.protocol !== "https:" || !isAllowedPreviewHost(pageUrl.hostname)) throw new Error("That product-page domain is not supported for image previews.");

  const cached = previewCache.get(pageUrl.href);
  if (cached?.expiresAt > Date.now()) return cached.imageUrl;

  const isFunko = pageUrl.hostname === "funko.com" || pageUrl.hostname.endsWith(".funko.com");
  const pathItem = pageUrl.pathname.match(/\/(\d{4,6})\.html$/)?.[1] || "";
  const queryItem = /^\d{4,6}$/.test(pageUrl.searchParams.get("q") || "") ? pageUrl.searchParams.get("q") : "";
  const funkoItem = isFunko ? pathItem || queryItem : "";
  let imageUrl = "";

  if (funkoItem) {
    const searchUrl = new URL(`https://funko.com/search/?q=${encodeURIComponent(funkoItem)}`);
    const { result, current } = await fetchPreviewPage(searchUrl);
    if (result.ok) imageUrl = productImageFromHtml(await result.text(), current, funkoItem);
    else await result.body?.cancel();
  }

  if (!imageUrl) {
    const { result, current } = await fetchPreviewPage(pageUrl);
    if (!result.ok) throw new Error(`The product page did not allow an image preview (${result.status}).`);
    const responseType = result.headers.get("content-type") || "";
    if (responseType.startsWith("image/")) {
      imageUrl = current.href;
      await result.body?.cancel();
    } else if (responseType.includes("html")) imageUrl = productImageFromHtml(await result.text(), current);
    else await result.body?.cancel();
  }

  if (!imageUrl) throw new Error("No product image was advertised by that page.");
  const parsedImage = new URL(imageUrl);
  if (!/^https?:$/.test(parsedImage.protocol)) throw new Error("The product page returned an unsafe image URL.");
  if (isFunko && parsedImage.pathname.includes("/dw/image/")) {
    parsedImage.searchParams.set("sw", "650");
    parsedImage.searchParams.set("sh", "650");
  }
  previewCache.set(pageUrl.href, { imageUrl: parsedImage.href, expiresAt: Date.now() + 12 * 60 * 60 * 1_000 });
  return parsedImage.href;
}

function plainText(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableDetail(html, label) {
  const match = html.match(new RegExp(`<td\\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>\\s*${escapePattern(label)}:?\\s*<\\/td>\\s*<td\\b[^>]*class=["'][^"']*details[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"));
  const value = plainText(match?.[1] || "");
  return /^(?:none|n\/a)$/i.test(value) ? "" : value;
}

function numericPrice(html, id) {
  const block = html.match(new RegExp(`<td\\b[^>]*id=["']${escapePattern(id)}["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"))?.[1] || "";
  const amount = plainText(block).match(/[\d,.]+/)?.[0]?.replace(/,/g, "");
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIdentity(value) {
  return plainText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/spider[- ]?man/g, "spider man")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityScore(input, candidate) {
  const inputUpc = String(input.upc || "").replace(/\D/g, "");
  if (inputUpc && candidate.upc && inputUpc === candidate.upc) return 1;
  const inputNumber = String(input.number || "").replace(/^#/, "").trim();
  if (inputNumber && candidate.number && inputNumber !== candidate.number) return 0;
  const noise = new Set(["funko", "pop", "vinyl", "the", "and"]);
  const sourceTokens = new Set(normalizeIdentity(input.name).split(" ").filter((word) => word && !noise.has(word)));
  const targetTokens = new Set(normalizeIdentity(candidate.name).split(" ").filter((word) => word && !noise.has(word)));
  const overlap = [...sourceTokens].filter((word) => targetTokens.has(word)).length;
  const tokenScore = overlap / Math.max(sourceTokens.size, targetTokens.size, 1);
  const numberScore = inputNumber && candidate.number ? 1 : inputNumber || candidate.number ? 0.35 : 0.6;
  return Math.min(1, tokenScore * 0.78 + numberScore * 0.22);
}

function priceChartingProduct(html, pageUrl) {
  const heading = html.match(/<h1\b[^>]*id=["']product_name["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  if (!heading) return null;
  const beforeLink = heading.split(/<a\b/i)[0];
  const fullName = plainText(beforeLink);
  const number = fullName.match(/#\s*(\d+[A-Za-z]?)(?:\s|$)/)?.[1] || "";
  const name = fullName.replace(/\s*#\s*\d+[A-Za-z]?\s*$/, "").trim();
  const catalogName = plainText(heading.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "").replace(/^Funko\s+POP\s*/i, "").trim();
  const canonical = tagAttribute(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || "", "href") || pageUrl.href;
  const releaseDate = tableDetail(html, "Release Date");
  const upc = tableDetail(html, "UPC").replace(/\D/g, "");
  const description = tableDetail(html, "Description") || tableDetail(html, "Notes");
  const currency = plainText(html.match(/<a\b[^>]*id=["']dropdown_selected_currency["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || "") || "USD";
  const checkedAt = new Date().toISOString();
  return {
    name,
    number,
    series: catalogName,
    sku: "",
    upc,
    description,
    releaseDate,
    imageUrl: productImageFromHtml(html, pageUrl),
    referencePrices: {
      currency,
      outOfBox: numericPrice(html, "used_price"),
      damagedBox: numericPrice(html, "complete_price"),
      newInBox: numericPrice(html, "new_price"),
      source: "PriceCharting",
      sourceUrl: canonical,
      checkedAt,
    },
    infoSources: [{ name: "PriceCharting", url: canonical, checkedAt }],
    sourceUrl: canonical,
  };
}

function amazonDetail(html, ...labels) {
  for (const label of labels) {
    const value = plainText(html.match(new RegExp(`<th\\b[^>]*>\\s*${escapePattern(label)}\\s*<\\/th>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, "i"))?.[1] || "");
    if (value && !/^(?:none|n\/a)$/i.test(value)) return value;
  }
  return "";
}

function inputValue(html, name) {
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    if (tagAttribute(tag, "name") === name || tagAttribute(tag, "id") === name) return tagAttribute(tag, "value");
  }
  return "";
}

function amazonProductFromHtml(html, pageUrl) {
  const pathAsin = pageUrl.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || "";
  const asin = (amazonDetail(html, "ASIN") || inputValue(html, "ASIN") || pathAsin).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const titleBlock = html.match(/<[^>]*\bid=["']productTitle["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || "";
  const metaTitleTag = (html.match(/<meta\b[^>]*(?:name|property)=["'](?:title|og:title)["'][^>]*>/i) || [""])[0];
  const fullTitle = plainText(titleBlock || tagAttribute(metaTitleTag, "content"));
  if (!fullTitle || !asin) return null;

  const name = fullTitle
    .replace(/^Funko\s+PoP!\s*/i, "")
    .replace(/\s*:\s*Amazon\.com\.au[\s\S]*$/i, "")
    .replace(/,\s*\d+(?:\.\d+)?\s*(?:cm|centimetres?|in(?:ches)?)\s+Height[\s\S]*$/i, "")
    .replace(/\s+Vinyl Figure[\s\S]*$/i, "")
    .trim();
  const upc = amazonDetail(html, "UPC", "EAN").replace(/\D/g, "");
  const model = amazonDetail(html, "Model Number", "Item model number", "Manufacturer Part Number", "Manufacturer reference").replace(/[^A-Z0-9-]/gi, "").toUpperCase();
  const funkoItem = extractFunkoItemNumber(upc) || extractFunkoItemNumber(model);
  const bulletBlock = html.match(/<div\b[^>]*\bid=["']feature-bullets["'][^>]*>[\s\S]{0,30000}?<\/ul>/i)?.[0] || "";
  const bullets = [...bulletBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => plainText(match[1])).filter(Boolean);
  const metaDescriptionTag = (html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i) || [""])[0];
  const description = (bullets.join(" ") || plainText(tagAttribute(metaDescriptionTag, "content"))).slice(0, 2_000);
  const releaseDate = amazonDetail(html, "Release date", "Date First Available");
  const currency = inputValue(html, "items[0.base][customerVisiblePrice][currencyCode]");
  const amountText = inputValue(html, "items[0.base][customerVisiblePrice][amount]");
  const amount = Number(amountText);
  const hasPrice = Boolean(currency && amountText && Number.isFinite(amount) && amount >= 0);
  const sourceUrl = `https://${pageUrl.hostname}/dp/${asin}`;
  const checkedAt = new Date().toISOString();

  return {
    name,
    number: "",
    series: /\bwhat if\b/i.test(fullTitle) ? "What If...?" : "",
    sku: funkoItem ? `FUN${funkoItem}` : model || asin,
    upc,
    description,
    releaseDate,
    imageUrl: productImageFromHtml(html, pageUrl),
    referencePrices: hasPrice ? {
      currency,
      outOfBox: null,
      damagedBox: null,
      newInBox: amount,
      source: "Amazon AU",
      sourceUrl,
      checkedAt,
    } : null,
    infoSources: [{ name: "Amazon AU", url: sourceUrl, checkedAt }],
    sourceUrl,
    asin,
  };
}

function productObjects(value) {
  const found = [];
  const pending = [value];
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object") continue;
    const types = Array.isArray(current["@type"]) ? current["@type"] : [current["@type"]];
    if (types.some((type) => String(type).toLowerCase() === "product")) found.push(current);
    if (Array.isArray(current)) pending.push(...current);
    else pending.push(...Object.values(current));
  }
  return found;
}

function funkoProductFromHtml(html, expectedItem) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const product of productObjects(JSON.parse(match[1].trim()))) {
        const item = String(product.sku || product.mpn || "").replace(/\D/g, "");
        if (item !== expectedItem) continue;
        return {
          name: plainText(product.name || ""),
          sku: `FUN${item}`,
          upc: String(product.gtin12 || product.gtin13 || "").replace(/\D/g, ""),
          description: plainText(product.description || ""),
          imageUrl: jsonImage(product.image),
          sourceUrl: String(product["@id"] || product.url || product.offers?.url || `https://funko.com/search/?q=${item}`),
        };
      }
    } catch {
      // Ignore malformed third-party structured data and try the next block.
    }
  }
  return null;
}

function extractFunkoItemNumber(value) {
  const compact = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
  const skuMatch = compact.match(/^(?:FUN|FK)(\d{4,6})$/);
  if (skuMatch) return skuMatch[1];
  const digits = compact.replace(/\D/g, "");
  const upc = digits.length === 13 && digits.startsWith("0") ? digits.slice(1) : digits;
  const barcodeMatch = upc.match(/^889698(\d{5})(\d)$/);
  if (barcodeMatch) return barcodeMatch[1];
  return /^\d{4,6}$/.test(digits) ? digits : "";
}

function searchLinks(item) {
  const nameQuery = ["Funko Pop", item.name, item.number ? `#${item.number}` : "", item.series && item.series !== "Unsorted" ? item.series : "", item.sku].filter(Boolean).join(" ");
  const priceQuery = item.upc || nameQuery;
  const ebayQuery = ["Funko", item.name, item.upc || item.sku, item.number ? `#${item.number}` : ""].filter(Boolean).join(" ");
  return {
    priceCharting: `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(priceQuery)}`,
    amazon: `https://www.amazon.com.au/s?k=${encodeURIComponent(nameQuery)}`,
    ebay: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(ebayQuery)}&LH_Sold=1&LH_Complete=1`,
    tradeMe: `https://www.trademe.co.nz/a/marketplace/search?search_string=${encodeURIComponent(nameQuery)}`,
  };
}

async function htmlPage(url) {
  const { result, current } = await fetchPreviewPage(new URL(url));
  if (!result.ok) {
    await result.body?.cancel();
    throw new Error(`Source returned ${result.status}.`);
  }
  const type = result.headers.get("content-type") || "";
  if (!type.includes("html")) {
    await result.body?.cancel();
    throw new Error("Source did not return a product page.");
  }
  return { html: await result.text(), current };
}

async function findPriceCharting(item, stages) {
  const direct = (() => {
    try {
      const url = new URL(item.customImageUrl || "");
      return /(^|\.)pricecharting\.com$/i.test(url.hostname) ? url.href : "";
    } catch {
      return "";
    }
  })();
  const links = searchLinks(item);
  const queries = [direct || links.priceCharting];
  if (!direct && item.upc) queries.push(searchLinks({ ...item, upc: "" }).priceCharting);
  let best = null;
  let bestScore = 0;
  let identifierConfirmed = false;

  for (const query of [...new Set(queries)]) {
    try {
      const { html, current } = await htmlPage(query);
      const product = priceChartingProduct(html, current);
      if (!product) continue;
      const hasIdentity = Boolean(item.name || item.number || item.sku || item.upc);
      const score = direct && !hasIdentity ? 0.98 : identityScore(item, product);
      if (score > bestScore) {
        best = product;
        bestScore = score;
      }
      if (score >= 0.9) break;
    } catch {
      // A later, less-specific search may still succeed.
    }
  }

  if (!best || bestScore < 0.55) {
    stages.push({ source: "PriceCharting", status: "searched", message: "No confident exact product was found; use the source link to verify variants.", url: links.priceCharting });
    return null;
  }

  if (!item.upc && best.upc) {
    try {
      const confirmedUrl = searchLinks({ ...item, upc: best.upc }).priceCharting;
      const { html, current } = await htmlPage(confirmedUrl);
      const confirmed = priceChartingProduct(html, current);
      if (confirmed?.sourceUrl === best.sourceUrl) identifierConfirmed = true;
    } catch {
      // The first high-confidence result remains useful when identifier confirmation is unavailable.
    }
  }

  stages.push({ source: "PriceCharting", status: "matched", message: `Matched ${best.name}${best.number ? ` #${best.number}` : ""}; found pricing${best.upc ? identifierConfirmed ? " and confirmed the discovered UPC" : " and UPC" : ""}.`, url: best.sourceUrl });
  return { ...best, confidence: bestScore };
}

async function findFunko(item, stages) {
  const itemNumber = extractFunkoItemNumber(item.sku) || extractFunkoItemNumber(item.upc);
  if (!itemNumber) {
    stages.push({ source: "Funko", status: "unavailable", message: "A Funko item ID or modern Funko barcode is needed for an exact official lookup.", url: `https://funko.com/search/?q=${encodeURIComponent(item.name || "Funko Pop")}` });
    return null;
  }
  const searchUrl = `https://funko.com/search/?q=${encodeURIComponent(itemNumber)}`;
  try {
    const { html } = await htmlPage(searchUrl);
    const product = funkoProductFromHtml(html, itemNumber);
    if (!product) throw new Error("No exact official product was returned.");
    stages.push({ source: "Funko", status: "matched", message: `Official item ${itemNumber} matched${product.name ? ` to ${product.name}` : ""}.`, url: product.sourceUrl });
    return product;
  } catch (error) {
    stages.push({ source: "Funko", status: "unavailable", message: error instanceof Error ? error.message : "Official lookup was unavailable.", url: searchUrl });
    return null;
  }
}

async function findAmazon(item, stages) {
  const links = searchLinks(item);
  let direct = "";
  try {
    const url = new URL(item.customImageUrl || "");
    if (isAmazonHost(url.hostname) && /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:[/?]|$)/i.test(url.pathname)) direct = url.href;
  } catch {
    // A normal image URL is not an Amazon product page.
  }
  if (!direct) {
    stages.push({ source: "Amazon AU", status: "searched", message: "Paste an exact Amazon product URL to import its image, identifiers, details, and current new price.", url: links.amazon });
    return null;
  }
  try {
    const { html, current } = await htmlPage(direct);
    const product = amazonProductFromHtml(html, current);
    if (!product) throw new Error("Amazon did not return readable product details for that listing.");
    const currentPrice = product.referencePrices ? `${product.referencePrices.currency} ${product.referencePrices.newInBox.toFixed(2)} current new price` : "";
    const found = [product.imageUrl && "image", product.upc && "UPC", product.sku && "item ID", currentPrice].filter(Boolean).join(", ");
    stages.push({ source: "Amazon AU", status: "matched", message: `Matched ASIN ${product.asin}${found ? `; found ${found}` : ""}.`, url: product.sourceUrl });
    return { ...product, confidence: 0.98 };
  } catch (error) {
    stages.push({ source: "Amazon AU", status: "unavailable", message: error instanceof Error ? error.message : "Amazon product details were unavailable.", url: direct });
    return null;
  }
}

async function enrichProduct(raw) {
  const item = {
    name: plainText(raw.name).slice(0, 200),
    number: plainText(raw.number).replace(/^#/, "").slice(0, 20),
    series: plainText(raw.series).slice(0, 160),
    sku: plainText(raw.sku).toUpperCase().slice(0, 50),
    upc: String(raw.upc || "").replace(/\D/g, "").slice(0, 14),
    customImageUrl: String(raw.customImageUrl || "").trim().slice(0, 2_048),
  };
  let directSupportedProduct = false;
  try {
    const customUrl = new URL(item.customImageUrl);
    directSupportedProduct = /(^|\.)pricecharting\.com$/i.test(customUrl.hostname) || isAmazonHost(customUrl.hostname);
  } catch {
    // A normal image URL is not enough to identify a product.
  }
  if (item.name.length < 2 && !item.sku && !item.upc && !directSupportedProduct) throw new Error("Add a title, SKU, barcode, or supported product URL before finding information.");
  const cacheKey = JSON.stringify(item);
  const cached = enrichmentCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.payload;

  const stages = [];
  const amazon = await findAmazon(item, stages);
  const amazonDiscovered = {
    ...item,
    name: amazon?.name || item.name,
    number: amazon?.number || item.number,
    series: amazon?.series || item.series,
    sku: amazon?.sku || item.sku,
    upc: amazon?.upc || item.upc,
  };
  const priceCharting = await findPriceCharting(amazonDiscovered, stages);
  const discovered = {
    ...amazonDiscovered,
    name: priceCharting?.name || amazonDiscovered.name,
    number: priceCharting?.number || amazonDiscovered.number,
    series: priceCharting?.series || amazonDiscovered.series,
    upc: priceCharting?.upc || amazonDiscovered.upc,
  };
  const funko = await findFunko(discovered, stages);
  if (funko?.upc && !discovered.upc) discovered.upc = funko.upc;

  const checkedAt = new Date().toISOString();
  const suggestion = priceCharting || amazon || funko ? {
    name: priceCharting?.name || amazon?.name || funko?.name || item.name,
    number: priceCharting?.number || amazon?.number || item.number,
    series: priceCharting?.series || amazon?.series || item.series,
    sku: funko?.sku || amazon?.sku || item.sku,
    upc: priceCharting?.upc || amazon?.upc || funko?.upc || item.upc,
    description: priceCharting?.description || amazon?.description || funko?.description || "",
    releaseDate: priceCharting?.releaseDate || amazon?.releaseDate || "",
    imageUrl: priceCharting?.imageUrl || amazon?.imageUrl || funko?.imageUrl || "",
    referencePrices: priceCharting?.referencePrices || amazon?.referencePrices || null,
    infoSources: [
      ...(amazon?.infoSources || []),
      ...(priceCharting?.infoSources || []),
      ...(funko ? [{ name: "Funko", url: funko.sourceUrl, checkedAt }] : []),
    ],
    confidence: priceCharting?.confidence ?? amazon?.confidence ?? (funko ? 1 : 0),
  } : null;
  const finalIdentity = suggestion ? { ...item, ...suggestion } : item;
  const links = searchLinks(finalIdentity);
  stages.push({ source: "eBay sold", status: "searched", message: "A public sold-listing search is ready for manual condition and sticker comparison.", url: links.ebay });
  stages.push({ source: "Trade Me", status: "searched", message: "A New Zealand marketplace search is ready for local asking-price comparison.", url: links.tradeMe });
  const payload = { suggestion, stages, links, checkedAt };
  enrichmentCache.set(cacheKey, { payload, expiresAt: Date.now() + 6 * 60 * 60 * 1_000 });
  return payload;
}

async function existingFile(pathname) {
  const cleanPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
  const requested = join(distRoot, cleanPath === "/" ? "index.html" : cleanPath);
  if (!requested.startsWith(distRoot)) return null;
  try {
    const info = await stat(requested);
    return info.isFile() ? requested : null;
  } catch {
    return null;
  }
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function requestBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 64_000) throw new Error("Request body is too large.");
  }
  return text ? JSON.parse(text) : {};
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/products/enrich") {
    json(response, 200, await enrichProduct(await requestBody(request)));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/images/preview") {
    const imageUrl = await resolveProductPageImage((url.searchParams.get("url") || "").trim());
    response.writeHead(302, {
      Location: imageUrl,
      "Cache-Control": "private, max-age=43200",
      "X-Content-Type-Options": "nosniff",
    });
    response.end();
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    json(response, 404, { error: "Unknown local API route." });
    return true;
  }
  return false;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (await handleApi(request, response, url)) return;
    const file = (await existingFile(url.pathname)) ?? join(distRoot, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((request.url || "").startsWith("/api/")) json(response, 400, { error: message });
    else {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Could not start Maxine's Pop Tracker.\n${message}`);
    }
  }
});

function openBrowser(url) {
  if (process.env.NO_OPEN === "1" || process.argv.includes("--no-open")) return;
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

server.listen(port, bindHost, () => {
  const localUrl = `http://127.0.0.1:${port}`;
  const networkName = hostname().includes(".") ? hostname() : `${hostname()}.lan`;
  const displayUrl = bindHost === "0.0.0.0" || bindHost === "::" ? `http://${networkName}:${port}` : `http://${bindHost}:${port}`;
  console.log("Maxine's Pop Tracker is running at:");
  console.log(`  ${displayUrl}`);
  if (displayUrl !== localUrl) console.log(`  ${localUrl} (from this computer)`);
  console.log("Press Ctrl+C to stop it.");
  openBrowser(localUrl);
});
