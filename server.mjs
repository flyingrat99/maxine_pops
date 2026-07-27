import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const distRoot = join(appRoot, "dist");
const connectionFile = join(appRoot, "data", "local-connections.json");
const portArgIndex = process.argv.indexOf("--port");
const parsedPort = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : Number(process.env.PORT);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 4173;
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
    const callback = `http://127.0.0.1:${port}/api/connections/trademe/callback`;
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

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Maxine's Pop Tracker is running at ${url}`);
  console.log("Press Ctrl+C to stop it.");
  openBrowser(url);
});
