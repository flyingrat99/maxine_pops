import { Check, Database, LoaderCircle, Pause, Plus, RotateCcw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InfoFinder, requestProductInfo } from "../components/InfoFinder";
import { PopImage } from "../components/PopImage";
import { PageHeader } from "../components/Common";
import { createLocalId, mergeProductInfo } from "../lib";
import { useTracker } from "../store";
import type { Category, ItemStatus, PopItem } from "../types";

function finderItem(seed: Partial<PopItem> = {}): PopItem {
  return {
    id: createLocalId("finder"),
    name: seed.name ?? "",
    number: seed.number ?? "",
    series: seed.series ?? "Unsorted",
    category: seed.category ?? "Marvel",
    status: "wishlist",
    quantity: 1,
    condition: "Near mint",
    comments: "",
    funkoApp: "",
    hobbyDb: "",
    sku: seed.sku ?? "",
    upc: seed.upc ?? "",
    description: "",
    releaseDate: "",
    referencePrices: null,
    infoSources: [],
    infoCheckedAt: "",
    favorite: false,
    location: "",
    purchasePrice: null,
    estimatedValue: null,
    askingPrice: null,
    valuationSource: "",
    valuedAt: "",
    catalogMatch: seed.catalogMatch ?? null,
    customImageUrl: seed.customImageUrl ?? "",
    sourceRef: "Added from Pop Info Finder",
  };
}

interface FinderProps {
  initialSeed?: Partial<PopItem> | null;
  onSeedUsed: () => void;
}

export function Finder({ initialSeed, onSeedUsed }: FinderProps) {
  const { state, addItem, updateItem } = useTracker();
  const [lookup, setLookup] = useState<PopItem>(() => finderItem(initialSeed ?? {}));
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, matched: 0, failed: 0, current: "" });
  const stopRequested = useRef(false);

  useEffect(() => {
    if (!initialSeed) return;
    setLookup(finderItem(initialSeed));
    onSeedUsed();
  }, [initialSeed, onSeedUsed]);

  useEffect(() => () => { stopRequested.current = true; }, []);

  const staleBefore = Date.now() - 30 * 24 * 60 * 60 * 1_000;
  const due = useMemo(() => state.items.filter((item) => {
    const checked = item.infoCheckedAt ? Date.parse(item.infoCheckedAt) : 0;
    return !Number.isFinite(checked) || checked < staleBefore;
  }), [state.items, staleBefore]);

  const addLookup = (status: ItemStatus) => {
    const next = { ...lookup, id: createLocalId(), status, sourceRef: "Added from Pop Info Finder" };
    addItem(next);
    setMessage(`${next.name || "Pop"} added to ${status === "owned" ? "the collection" : status === "sale" ? "for sale" : "the wishlist"}.`);
    setLookup(finderItem());
  };

  const runBatch = async (refreshAll = false) => {
    const queue = refreshAll ? [...state.items] : due;
    if (!queue.length) return;
    stopRequested.current = false;
    setRunning(true);
    setConfirmBatch(false);
    setMessage("");
    let matched = 0;
    let failed = 0;
    setProgress({ done: 0, total: queue.length, matched: 0, failed: 0, current: "" });
    for (let index = 0; index < queue.length; index += 1) {
      if (stopRequested.current) break;
      const item = queue[index];
      setProgress({ done: index, total: queue.length, matched, failed, current: item.name });
      try {
        const result = await requestProductInfo(item);
        updateItem(mergeProductInfo(item, result, false));
        if (result.suggestion && result.suggestion.confidence >= 0.9) matched += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: queue.length, matched, failed, current: item.name });
      if (index < queue.length - 1 && !stopRequested.current) await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
    const stopped = stopRequested.current;
    setRunning(false);
    setMessage(stopped ? `Stopped after ${matched + failed} checks. Saved results are kept.` : `Info pass complete: ${matched} matched, ${failed} unavailable.`);
  };

  return (
    <div className="finder-page">
      <PageHeader eyebrow="SEARCH, VERIFY, ENRICH" title="Pop Info Finder" description="Use the same tiered lookup for any Pop—owned, wanted, for sale, or not yet saved—then keep the source trail with the record." />
      {message && <div className="inline-alert success page-alert"><Check /><p>{message}</p></div>}
      <div className="finder-layout">
        <section className="panel finder-workbench">
          <div className="panel-heading"><div><span className="eyebrow red">ANY POP</span><h2>Start with what you know</h2></div><Search /></div>
          <div className="finder-input-grid">
            <label><span>Title</span><input value={lookup.name} onChange={(event) => setLookup((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Blue Stealth Iron Man" /></label>
            <label><span>Box number</span><input value={lookup.number} onChange={(event) => setLookup((current) => ({ ...current, number: event.target.value }))} placeholder="e.g. 4" /></label>
            <label><span>Series / collection</span><input value={lookup.series} onChange={(event) => setLookup((current) => ({ ...current, series: event.target.value }))} placeholder="e.g. Marvel" /></label>
            <label><span>SKU / Funko item ID</span><input value={lookup.sku} onChange={(event) => setLookup((current) => ({ ...current, sku: event.target.value }))} placeholder="FUN82769" /></label>
            <label><span>UPC / EAN</span><input value={lookup.upc} onChange={(event) => setLookup((current) => ({ ...current, upc: event.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="889698827690" /></label>
            <label><span>Category</span><select value={lookup.category} onChange={(event) => setLookup((current) => ({ ...current, category: event.target.value as Category }))}><option>Marvel</option><option>Others</option></select></label>
            <label className="finder-url-field"><span>Image or product page URL</span><input type="url" value={lookup.customImageUrl} onChange={(event) => setLookup((current) => ({ ...current, customImageUrl: event.target.value }))} placeholder="Paste a PriceCharting, Funko, retailer, or image URL" /></label>
          </div>
          {(lookup.description || lookup.releaseDate || lookup.customImageUrl) && (
            <div className="finder-found-preview">
              <div><PopImage item={lookup} useProxy={state.settings.imageProxy} eager /></div>
              <div><span className="eyebrow red">APPLIED RESULT</span><h3>{lookup.name}{lookup.number ? ` #${lookup.number}` : ""}</h3><p>{lookup.description || "Product details found and ready to save."}</p>{lookup.releaseDate && <small>Released {lookup.releaseDate}</small>}</div>
            </div>
          )}
          <div className="finder-save-actions">
            <span>Save this Pop as:</span>
            <button className="button secondary" onClick={() => addLookup("owned")} disabled={!lookup.name.trim()}><Plus size={15} /> Collection</button>
            <button className="button secondary" onClick={() => addLookup("wishlist")} disabled={!lookup.name.trim()}><Plus size={15} /> Wishlist</button>
            <button className="button secondary" onClick={() => addLookup("sale")} disabled={!lookup.name.trim()}><Plus size={15} /> For sale</button>
            <button className="text-button" onClick={() => setLookup(finderItem())}><RotateCcw size={13} /> Clear</button>
          </div>
        </section>
        <InfoFinder item={lookup} onApply={(result) => setLookup((current) => mergeProductInfo(current, result, true))} />
      </div>

      <section className="panel batch-finder-panel">
        <div className="panel-heading"><div><span className="eyebrow red">COLLECTION-WIDE</span><h2>Fill information gaps</h2></div><Database /></div>
        <p>Runs the same finder sequentially across every collection, wishlist, and for-sale record. Results save after each Pop; recently checked records are skipped for 30 days.</p>
        <div className="batch-summary"><strong>{due.length.toLocaleString()}</strong><span>of {state.items.length.toLocaleString()} records due for a check</span></div>
        {running && (
          <div className="batch-progress">
            <div><span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
            <p><strong>{progress.done.toLocaleString()} / {progress.total.toLocaleString()}</strong><span>{progress.current}</span><small>{progress.matched} matched · {progress.failed} unavailable</small></p>
          </div>
        )}
        <div className="batch-actions">
          {running ? <button className="button secondary" onClick={() => { stopRequested.current = true; }}><Pause size={16} /> Stop after this Pop</button> : confirmBatch ? <><button className="button primary" onClick={() => runBatch(false)}><Sparkles size={16} /> Start {due.length.toLocaleString()} checks</button><button className="button ghost" onClick={() => setConfirmBatch(false)}>Cancel</button></> : <button className="button primary" onClick={() => setConfirmBatch(true)} disabled={!due.length}><Sparkles size={16} /> Find info for all due Pops</button>}
          {!running && due.length === 0 && <button className="button ghost" onClick={() => runBatch(true)}><RotateCcw size={15} /> Refresh every Pop now</button>}
        </div>
        {confirmBatch && <p className="fine-print">This can take a while for a large library. Keep this page open; you can stop safely at any time.</p>}
      </section>
    </div>
  );
}
