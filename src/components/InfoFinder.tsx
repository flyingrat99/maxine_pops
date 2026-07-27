import { Check, ExternalLink, ImageIcon, Info, LoaderCircle, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney, marketLinks } from "../lib";
import type { PopItem, ProductInfoResponse } from "../types";

type FinderItem = Pick<PopItem, "name" | "number" | "series" | "sku" | "upc" | "customImageUrl">;

interface InfoFinderProps {
  item: FinderItem;
  onApply: (result: ProductInfoResponse) => void;
}

export async function requestProductInfo(item: FinderItem, signal?: AbortSignal): Promise<ProductInfoResponse> {
  const response = await fetch("/api/products/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
    signal,
  });
  const payload = await response.json() as ProductInfoResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Information search failed (${response.status}).`);
  return payload;
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function InfoFinder({ item, onApply }: InfoFinderProps) {
  const [result, setResult] = useState<ProductInfoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const fallbackLinks = useMemo(() => marketLinks(item), [item]);
  const hasLookupInput = Boolean(item.name.trim() || item.sku.trim() || item.upc.trim() || /(?:pricecharting\.com|amazon\.com\.au)/i.test(item.customImageUrl));

  const findInfo = async () => {
    setLoading(true);
    setError("");
    setApplied(false);
    try {
      setResult(await requestProductInfo(item));
    } catch (searchError) {
      setResult(null);
      setError(searchError instanceof Error ? searchError.message : "Information search failed.");
    } finally {
      setLoading(false);
    }
  };

  const suggestion = result?.suggestion;
  const prices = suggestion?.referencePrices;
  const links = result?.links ?? fallbackLinks;

  return (
    <section className="info-finder-panel">
      <div className="market-heading">
        <div>
          <span className="eyebrow red">POP INFO FINDER</span>
          <h3>Find the full story</h3>
        </div>
        <Sparkles size={22} />
      </div>
      <p className="market-caveat">Checks exact identifiers first, then title and box number. Newly found UPC or SKU details are reused for a stronger follow-up search.</p>
      <button className="button secondary full" type="button" onClick={findInfo} disabled={loading || !hasLookupInput}>
        {loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
        {loading ? "Checking trusted sources…" : "Find info"}
      </button>
      {error && <div className="inline-alert warning info-alert"><Info size={16} /><p>{error}</p></div>}

      {result && (
        <div className="info-results">
          <div className="info-stage-list">
            {result.stages.map((stage) => (
              <a key={`${stage.source}-${stage.url}`} className={`info-stage ${stage.status}`} href={stage.url} target="_blank" rel="noreferrer">
                <span>{stage.status === "matched" ? <Check size={13} /> : <Search size={13} />}</span>
                <div><strong>{stage.source}</strong><small>{stage.message}</small></div>
                <ExternalLink size={12} />
              </a>
            ))}
          </div>

          {suggestion ? (
            <div className="info-match-card">
              <div className="info-match-heading">
                {suggestion.imageUrl ? <img src={suggestion.imageUrl} alt="" /> : <span className="info-match-image"><ImageIcon /></span>}
                <div><small>{Math.round(suggestion.confidence * 100)}% identity confidence</small><strong>{suggestion.name}{suggestion.number ? ` #${suggestion.number}` : ""}</strong><span>{suggestion.series}</span></div>
              </div>
              <dl className="info-details">
                <Detail label="SKU" value={suggestion.sku} />
                <Detail label="UPC / EAN" value={suggestion.upc} />
                <Detail label="Released" value={suggestion.releaseDate} />
                <Detail label="Description" value={suggestion.description} />
              </dl>
              {prices && (
                <div className="reference-prices">
                  <span><small>Out of box</small><strong>{formatMoney(prices.outOfBox, prices.currency)}</strong></span>
                  <span><small>Damaged box</small><strong>{formatMoney(prices.damagedBox, prices.currency)}</strong></span>
                  <span><small>New / sealed</small><strong>{formatMoney(prices.newInBox, prices.currency)}</strong></span>
                  <p>{prices.currency} reference prices · checked {new Date(prices.checkedAt).toLocaleDateString("en-NZ")}</p>
                </div>
              )}
              {suggestion.confidence < 0.9 && <div className="inline-alert warning info-alert"><Info size={15} /><p>This is a possible match. Compare the box number, sticker and variant before applying it.</p></div>}
              <button className="button primary full" type="button" onClick={() => { onApply(result); setApplied(true); }}>
                {applied ? <Check size={17} /> : <Sparkles size={17} />}{applied ? "Details applied" : "Apply verified details"}
              </button>
            </div>
          ) : <div className="empty-mini info-empty">No confident exact match yet. The source searches are still available for a manual check.</div>}
        </div>
      )}

      <div className="external-market-links">
        <span>Open the searches directly:</span>
        <a href={links.priceCharting} target="_blank" rel="noreferrer">PriceCharting <ExternalLink size={13} /></a>
        <a href={links.amazon} target="_blank" rel="noreferrer">Amazon AU <ExternalLink size={13} /></a>
        <a href={links.ebay} target="_blank" rel="noreferrer">eBay sold <ExternalLink size={13} /></a>
        <a href={links.tradeMe} target="_blank" rel="noreferrer">Trade Me <ExternalLink size={13} /></a>
      </div>
    </section>
  );
}
