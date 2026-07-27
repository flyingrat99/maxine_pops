import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { hostname } from "node:os";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const distRoot = join(appRoot, "dist");
const connectionFile = join(appRoot, "data", "local-connections.json");
const portArgIndex = process.argv.indexOf("--port");
const parsedPort = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : Number(process.env.PORT);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 4173;
const hostArgIndex = process.argv.indexOf("--host");
const requestedHost = hostArgIndex >= 0 ? process.argv[hostArgIndex + 1] : process.env.HOST;
const bindHost = requestedHost && /^[a-zA-Z0-9.:[\]-]+$/.test(requestedHost) ? requestedHost : "127.0.0.1";
let ebayTokenCache = null;

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
  "ebay.co.uk", "ebay.com", "ebay.com.au", "funko.com", "hobbydb.com", "popcultcha.com.au",
  "pricecharting.com", "trademe.co.nz",
];
const previewCache = new Map();

function isAllowedPreviewHost(hostname) {
  const host = hostname.toLowerCase();
  return previewDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
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

async function readConnections() {
  try {
    return JSON.parse(await readFile(connectionFile, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeConnections(config) {
  const temporary = connectionFile + ".tmp";
  await mkdir(join(appRoot, "data"), { recursive: true });
  await writeFile(temporary, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, connectionFile);
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function redirect(response, location) {
  response.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  response.end();
}

async function requestBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 64_000) throw new Error("Request body is too large.");
  }
  return text ? JSON.parse(text) : {};
}

function publicConnectionStatus(config) {
  const ebay = config.ebay ?? {};
  const trademe = config.trademe ?? {};
  return {
    ebay: {
      configured: Boolean(ebay.clientId && ebay.clientSecret),
      marketplace: ebay.marketplace || "EBAY_AU",
      label: ebay.clientId && ebay.clientSecret ? `Configured · ${ebay.marketplace || "EBAY_AU"}` : "Not configured",
    },
    trademe: {
      configured: Boolean(trademe.consumerKey && trademe.consumerSecret),
      connected: Boolean(trademe.oauthToken && trademe.oauthTokenSecret),
      environment: trademe.environment === "sandbox" ? "sandbox" : "production",
      label: trademe.oauthToken && trademe.oauthTokenSecret ? "Member connected" : trademe.consumerKey && trademe.consumerSecret ? "App configured" : "Not configured",
    },
  };
}

function cleanSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}

function oauthEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthHeader(values) {
  return "OAuth " + Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
    .join(", ");
}

function tradeMeBase(environment) {
  return environment === "sandbox" ? "https://api.tmsandbox.co.nz" : "https://api.trademe.co.nz";
}

function tradeMeAuth(config, extras = {}) {
  const consumerSecret = config.consumerSecret || "";
  const tokenSecret = extras.tokenSecret ?? config.oauthTokenSecret ?? "";
  return oauthHeader({
    oauth_callback: extras.callback,
    oauth_consumer_key: config.consumerKey,
    oauth_signature: `${consumerSecret}&${tokenSecret}`,
    oauth_signature_method: "PLAINTEXT",
    oauth_token: extras.token ?? config.oauthToken,
    oauth_verifier: extras.verifier,
    oauth_version: "1.0",
  });
}

async function ebayToken(ebay) {
  if (ebayTokenCache && ebayTokenCache.clientId === ebay.clientId && ebayTokenCache.expiresAt > Date.now() + 60_000) {
    return ebayTokenCache.token;
  }
  const credentials = Buffer.from(`${ebay.clientId}:${ebay.clientSecret}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || `eBay authorization failed (${response.status}).`);
  ebayTokenCache = {
    clientId: ebay.clientId,
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 7200) * 1000,
  };
  return payload.access_token;
}

async function searchEbay(query, ebay) {
  if (!ebay?.clientId || !ebay?.clientSecret) throw new Error("eBay API credentials are not configured. Open Settings to add them.");
  const token = await ebayToken(ebay);
  const endpoint = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  endpoint.search = new URLSearchParams({ q: query, limit: "24", filter: "buyingOptions:{FIXED_PRICE|AUCTION}" }).toString();
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": ebay.marketplace || "EBAY_AU",
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.errors?.[0]?.message || `eBay search failed (${response.status}).`);
  return {
    source: "ebay",
    query,
    total: payload.total || 0,
    listings: (payload.itemSummaries || []).map((item) => ({
      id: item.itemId,
      title: item.title || "eBay listing",
      price: Number(item.price?.value || item.currentBidPrice?.value || 0),
      currency: item.price?.currency || item.currentBidPrice?.currency || "AUD",
      imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
      url: item.itemWebUrl || "https://www.ebay.com/",
      condition: item.condition || "",
      buyingOption: (item.buyingOptions || []).join(", "),
    })).filter((item) => item.price > 0),
  };
}

async function searchTradeMe(query, trademe) {
  if (!trademe?.consumerKey || !trademe?.consumerSecret) throw new Error("Trade Me API credentials are not configured. Open Settings to add them.");
  const endpoint = new URL(`${tradeMeBase(trademe.environment)}/v1/Search/General.json`);
  endpoint.search = new URLSearchParams({ search_string: query, rows: "24", photo_size: "List", sort_order: "Default" }).toString();
  const response = await fetch(endpoint, { headers: { Authorization: tradeMeAuth(trademe) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.ErrorDescription || payload.Message || `Trade Me search failed (${response.status}).`);
  const webBase = trademe.environment === "sandbox" ? "https://www.tmsandbox.co.nz" : "https://www.trademe.co.nz";
  return {
    source: "trademe",
    query,
    total: payload.TotalCount || 0,
    listings: (payload.List || []).map((item) => ({
      id: String(item.ListingId),
      title: item.Title || "Trade Me listing",
      price: Number(item.BuyNowPrice || item.MaxBidAmount || item.StartPrice || 0),
      currency: "NZD",
      imageUrl: item.PictureHref || "",
      url: `${webBase}/a/marketplace/listing/${item.ListingId}`,
      condition: item.IsNew ? "New" : "Used / unspecified",
      buyingOption: item.HasBuyNow ? "Buy Now" : "Auction",
    })).filter((item) => item.price > 0),
  };
}

async function handleApi(request, response, url) {
  const config = await readConnections();
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

  if (request.method === "GET" && url.pathname === "/api/connections") {
    json(response, 200, publicConnectionStatus(config));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/connections/ebay") {
    const body = await requestBody(request);
    const current = config.ebay ?? {};
    const next = {
      clientId: cleanSecret(body.clientId) || current.clientId || "",
      clientSecret: cleanSecret(body.clientSecret) || current.clientSecret || "",
      marketplace: ["EBAY_AU", "EBAY_US", "EBAY_GB"].includes(body.marketplace) ? body.marketplace : current.marketplace || "EBAY_AU",
    };
    if (!next.clientId || !next.clientSecret) throw new Error("Enter both the eBay Client ID and Client Secret.");
    await writeConnections({ ...config, ebay: next });
    ebayTokenCache = null;
    json(response, 200, { message: "eBay app credentials saved in the local credential file." });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/connections/trademe") {
    const body = await requestBody(request);
    const current = config.trademe ?? {};
    const next = {
      ...current,
      consumerKey: cleanSecret(body.consumerKey) || current.consumerKey || "",
      consumerSecret: cleanSecret(body.consumerSecret) || current.consumerSecret || "",
      environment: body.environment === "sandbox" ? "sandbox" : body.environment === "production" ? "production" : current.environment || "production",
    };
    if (!next.consumerKey || !next.consumerSecret) throw new Error("Enter both the Trade Me Consumer Key and Consumer Secret.");
    if (current.environment && current.environment !== next.environment) {
      delete next.oauthToken;
      delete next.oauthTokenSecret;
    }
    await writeConnections({ ...config, trademe: next });
    json(response, 200, { message: "Trade Me app credentials saved in the local credential file." });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/connections/ebay/test") {
    const result = await searchEbay("Funko Pop Marvel", config.ebay);
    json(response, 200, { message: `eBay connection works — found ${result.total.toLocaleString()} active results.` });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/connections/trademe/test") {
    const result = await searchTradeMe("Funko Pop", config.trademe);
    json(response, 200, { message: `Trade Me connection works — found ${result.total.toLocaleString()} active results.` });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/connections/trademe/start") {
    const trademe = config.trademe;
    if (!trademe?.consumerKey || !trademe?.consumerSecret) throw new Error("Save Trade Me app credentials first.");
    const callback = `${url.origin}/api/connections/trademe/callback`;
    const endpoint = `${tradeMeBase(trademe.environment)}/Oauth/RequestToken?scope=MyTradeMeRead`;
    const tokenResponse = await fetch(endpoint, { method: "POST", headers: { Authorization: tradeMeAuth(trademe, { callback }) } });
    const tokenText = await tokenResponse.text();
    const tokenData = new URLSearchParams(tokenText);
    const requestToken = tokenData.get("oauth_token");
    const requestTokenSecret = tokenData.get("oauth_token_secret");
    if (!tokenResponse.ok || !requestToken || !requestTokenSecret) throw new Error(tokenData.get("oauth_problem") || `Trade Me authorization could not start (${tokenResponse.status}).`);
    await writeConnections({ ...config, trademe: { ...trademe, pendingToken: requestToken, pendingTokenSecret: requestTokenSecret } });
    const website = trademe.environment === "sandbox" ? "https://www.tmsandbox.co.nz" : "https://www.trademe.co.nz";
    json(response, 200, { authorizeUrl: `${website}/Oauth/Authorize?oauth_token=${encodeURIComponent(requestToken)}` });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/connections/trademe/callback") {
    const trademe = config.trademe;
    const token = url.searchParams.get("oauth_token");
    const verifier = url.searchParams.get("oauth_verifier");
    if (!trademe?.pendingToken || token !== trademe.pendingToken || !verifier) throw new Error("Trade Me returned an invalid or expired authorization response.");
    const endpoint = `${tradeMeBase(trademe.environment)}/Oauth/AccessToken`;
    const tokenResponse = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: tradeMeAuth(trademe, { token, tokenSecret: trademe.pendingTokenSecret, verifier }) },
    });
    const tokenText = await tokenResponse.text();
    const tokenData = new URLSearchParams(tokenText);
    const oauthToken = tokenData.get("oauth_token");
    const oauthTokenSecret = tokenData.get("oauth_token_secret");
    if (!tokenResponse.ok || !oauthToken || !oauthTokenSecret) throw new Error(tokenData.get("oauth_problem") || `Trade Me authorization failed (${tokenResponse.status}).`);
    const nextTradeMe = { ...trademe, oauthToken, oauthTokenSecret };
    delete nextTradeMe.pendingToken;
    delete nextTradeMe.pendingTokenSecret;
    await writeConnections({ ...config, trademe: nextTradeMe });
    redirect(response, "/#settings-connected");
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/connections/trademe/token") {
    const trademe = { ...(config.trademe ?? {}) };
    delete trademe.oauthToken;
    delete trademe.oauthTokenSecret;
    delete trademe.pendingToken;
    delete trademe.pendingTokenSecret;
    await writeConnections({ ...config, trademe });
    json(response, 200, { message: "Local Trade Me member token removed." });
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/connections/ebay") {
    const next = { ...config };
    delete next.ebay;
    ebayTokenCache = null;
    await writeConnections(next);
    json(response, 200, { message: "Saved eBay app credentials removed." });
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/connections/trademe") {
    const next = { ...config };
    delete next.trademe;
    await writeConnections(next);
    json(response, 200, { message: "Saved Trade Me app credentials and member token removed." });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/markets/search") {
    const source = url.searchParams.get("source");
    const query = (url.searchParams.get("q") || "").trim().slice(0, 200);
    if (query.length < 2) throw new Error("Enter at least two characters to search.");
    const result = source === "trademe" ? await searchTradeMe(query, config.trademe) : source === "ebay" ? await searchEbay(query, config.ebay) : null;
    if (!result) throw new Error("Unknown marketplace source.");
    json(response, 200, result);
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
