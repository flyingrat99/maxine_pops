import { ExternalLink, ImagePlus, LoaderCircle, Search, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney, marketLinks, marketQuery, median } from "../lib";
import type { MarketSearchResponse, PopItem } from "../types";

interface MarketSearchProps {
  item: Pick<PopItem, "name" | "number" | "series">;
  appCurrency: string;
  onUseEstimate: (value: number, source: string) => void;
  onUseImage: (imageUrl: string) => void;
  onOpenSettings?: () => void;
}

export function MarketSearch({ item, appCurrency, onUseEstimate, onUseImage, onOpenSettings }: MarketSearchProps) {
  const [source, setSource] = useState<"trademe" | "ebay">("trademe");
  const [result, setResult] = useState<MarketSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const links = marketLinks(item);
  const askingMedian = useMemo(() => median(result?.listings.map((listing) => listing.price) ?? []), [result]);
  const resultCurrency = result?.listings.find((listing) => listing.currency)?.currency ?? appCurrency;

  const runSearch = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/markets/search?source=${source}&q=${encodeURIComponent(marketQuery(item))}`);
      const payload = await response.json() as MarketSearchResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || `Market search failed (${response.status}).`);
      setResult(payload);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Market search failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="market-search-panel">
      <div className="market-heading">
        <div>
          <span className="eyebrow red">PRICE CHECK</span>
          <h3>Market signals</h3>
        </div>
        <ShoppingBag size={22} />
      </div>
      <p className="market-caveat">Active asking prices are a clue, not a sale value. Check condition, sticker, box, shipping, and recent sold listings.</p>
      <div className="market-tabs">
        <button className={source === "trademe" ? "active" : ""} onClick={() => { setSource("trademe"); setResult(null); }}>Trade Me</button>
        <button className={source === "ebay" ? "active" : ""} onClick={() => { setSource("ebay"); setResult(null); }}>eBay</button>
      </div>
      <button className="button secondary full" onClick={runSearch} disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
        Search connected {source === "trademe" ? "Trade Me" : "eBay"}
      </button>
      {error && (
        <div className="inline-alert warning">
          <p>{error}</p>
          {onOpenSettings && <button onClick={onOpenSettings}>Open connection settings</button>}
        </div>
      )}
      {result && (
        <div className="market-results">
          <div className="market-summary">
            <span>{result.total.toLocaleString()} active results</span>
            <strong>Median ask: {formatMoney(askingMedian, resultCurrency)}</strong>
          </div>
          {askingMedian !== null && (
            <button
              className="text-button"
              disabled={resultCurrency !== appCurrency}
              title={resultCurrency !== appCurrency ? `The app is using ${appCurrency}; convert this ${resultCurrency} amount first.` : "Record this active-listing median as the estimate"}
              onClick={() => onUseEstimate(askingMedian, `${source === "trademe" ? "Trade Me" : "eBay"} active-listing median`)}
            >
              Use {formatMoney(askingMedian, resultCurrency)} as estimate
            </button>
          )}
          <div className="listing-strip">
            {result.listings.slice(0, 8).map((listing) => (
              <article key={listing.id} className="mini-listing">
                {listing.imageUrl ? <img src={listing.imageUrl} alt="" loading="lazy" /> : <div className="mini-image" />}
                <div><span>{listing.title}</span><strong>{formatMoney(listing.price, listing.currency)}</strong></div>
                <div className="mini-listing-actions">
                  <a href={listing.url} target="_blank" rel="noreferrer" title="Open listing"><ExternalLink size={12} /></a>
                  {listing.imageUrl && <button type="button" onClick={() => onUseImage(listing.imageUrl)} title="Use this listing image"><ImagePlus size={12} /> Use image</button>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      <div className="external-market-links">
        <span>Or check directly:</span>
        <a href={links.tradeMe} target="_blank" rel="noreferrer">Trade Me <ExternalLink size={13} /></a>
        <a href={links.ebay} target="_blank" rel="noreferrer">eBay sold <ExternalLink size={13} /></a>
        <a href={links.priceCharting} target="_blank" rel="noreferrer">PriceCharting <ExternalLink size={13} /></a>
      </div>
    </section>
  );
}
