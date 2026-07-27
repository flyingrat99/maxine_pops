import { Check, Database, LoaderCircle, Pause, Plus, RotateCcw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InfoFinder, requestProductInfo } from "../components/InfoFinder";
import { PopImage } from "../components/PopImage";
import { PhotoSourceField } from "../components/PhotoSourceField";
import { PageHeader } from "../components/Common";
import { createLocalId, mergeProductInfo } from "../lib";
import { useTracker } from "../store";
import type { Category, ItemStatus, PopItem } from "../types";

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

interface BatchUpdates {
  records: number;
  images: number;
  barcodes: number;
  skus: number;
  descriptions: number;
  releaseDates: number;
  boxNumbers: number;
  prices: number;
}

const emptyBatchUpdates = (): BatchUpdates => ({ records: 0, images: 0, barcodes: 0, skus: 0, descriptions: 0, releaseDates: 0, boxNumbers: 0, prices: 0 });

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
  const [stopping, setStopping] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, matched: 0, failed: 0, current: "", updates: emptyBatchUpdates() });
  const stopRequested = useRef(false);

  useEffect(() => {
    if (!initialSeed) return;
    setLookup(finderItem(initialSeed));
    onSeedUsed();
  }, [initialSeed, onSeedUsed]);

  useEffect(() => () => { stopRequested.current = true; }, []);

  useEffect(() => {
    if (!running || !runStartedAt) return;
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - runStartedAt) / 1_000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [running, runStartedAt]);

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
    setStopping(false);
    setRunning(true);
    setConfirmBatch(false);
    setMessage("");
    setRunStartedAt(Date.now());
    setElapsedSeconds(0);
    let matched = 0;
    let failed = 0;
    const updates = emptyBatchUpdates();
    setProgress({ done: 0, total: queue.length, matched: 0, failed: 0, current: "", updates: { ...updates } });
    for (let index = 0; index < queue.length; index += 1) {
      if (stopRequested.current) break;
      const item = queue[index];
      setProgress({ done: index, total: queue.length, matched, failed, current: item.name, updates: { ...updates } });
      try {
        const result = await requestProductInfo(item);
        const enriched = mergeProductInfo(item, result, false);
        const beforePrices = JSON.stringify(item.referencePrices);
        const afterPrices = JSON.stringify(enriched.referencePrices);
        const changed = {
          images: enriched.customImageUrl !== item.customImageUrl,
          barcodes: enriched.upc !== item.upc,
          skus: enriched.sku !== item.sku,
          descriptions: enriched.description !== item.description,
          releaseDates: enriched.releaseDate !== item.releaseDate,
          boxNumbers: enriched.number !== item.number,
          prices: beforePrices !== afterPrices,
        };
        if (Object.values(changed).some(Boolean)) updates.records += 1;
        for (const [field, wasChanged] of Object.entries(changed) as [keyof Omit<BatchUpdates, "records">, boolean][]) {
          if (wasChanged) updates[field] += 1;
        }
        updateItem(enriched);
        if (result.suggestion && result.suggestion.confidence >= 0.9) matched += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: queue.length, matched, failed, current: item.name, updates: { ...updates } });
      if (index < queue.length - 1 && !stopRequested.current) await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
    const stopped = stopRequested.current;
    setRunning(false);
    setStopping(false);
    setMessage(stopped ? `Stopped after ${matched + failed} checks. Saved results are kept.` : `Info pass complete: ${matched} matched, ${failed} unavailable.`);
  };

  const progressPercent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const estimatedRemaining = progress.done > 0 ? (elapsedSeconds / progress.done) * (progress.total - progress.done) : 0;

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
            <PhotoSourceField key={lookup.id} className="finder-url-field" value={lookup.customImageUrl} onChange={(customImageUrl) => setLookup((current) => ({ ...current, customImageUrl }))} />
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
        {confirmBatch && !running && (
          <div className="batch-confirmation" role="alert">
            <Sparkles size={22} />
            <div><strong>Ready to check {due.length.toLocaleString()} Pops</strong><p>The pass starts only after you confirm below. Keep this page open; you can stop safely at any time.</p></div>
          </div>
        )}
        {(running || progress.total > 0) && (
          <div className={`batch-progress-card ${running ? "running" : "finished"}`} aria-live="polite">
            <div className="batch-progress-top">
              <div className="batch-progress-percent"><strong>{progressPercent}%</strong><span>{running ? stopping ? "Stopping after this Pop…" : "Finder running" : "Last run"}</span></div>
              <div className="batch-progress-time"><span>Elapsed <strong>{formatDuration(elapsedSeconds)}</strong></span>{running && progress.done > 0 && <span>About <strong>{formatDuration(estimatedRemaining)}</strong> remaining</span>}</div>
            </div>
            <div className="batch-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Pop information lookup progress"><span style={{ width: `${progressPercent}%` }} /></div>
            <div className="batch-progress-detail">
              <div className="batch-current-pop">{running && <LoaderCircle className="spin" size={16} />}<span>Current Pop</span><strong>{progress.current || "Preparing first lookup…"}</strong></div>
              <div className="batch-progress-counts"><span><strong>{progress.done.toLocaleString()}</strong> / {progress.total.toLocaleString()} checked</span><span><strong>{progress.matched.toLocaleString()}</strong> matched</span><span><strong>{progress.failed.toLocaleString()}</strong> unavailable</span></div>
            </div>
            <div className="batch-live-updates"><span>Information added so far</span><strong>{progress.updates.records.toLocaleString()} records updated</strong><small>{progress.updates.images} images · {progress.updates.barcodes} barcodes · {progress.updates.skus} SKUs · {progress.updates.prices} price guides</small></div>
          </div>
        )}
        {!running && progress.done > 0 && (
          <section className="batch-update-summary">
            <div><span className="eyebrow red">RUN SUMMARY</span><h3>{progress.updates.records.toLocaleString()} records gained information</h3><p>{progress.done.toLocaleString()} checked · {progress.matched.toLocaleString()} confident matches · {progress.failed.toLocaleString()} unavailable or uncertain</p></div>
            <dl>
              <div><dt>Images</dt><dd>{progress.updates.images.toLocaleString()}</dd></div>
              <div><dt>Barcodes</dt><dd>{progress.updates.barcodes.toLocaleString()}</dd></div>
              <div><dt>SKU / item IDs</dt><dd>{progress.updates.skus.toLocaleString()}</dd></div>
              <div><dt>Descriptions</dt><dd>{progress.updates.descriptions.toLocaleString()}</dd></div>
              <div><dt>Release dates</dt><dd>{progress.updates.releaseDates.toLocaleString()}</dd></div>
              <div><dt>Box numbers</dt><dd>{progress.updates.boxNumbers.toLocaleString()}</dd></div>
              <div><dt>Price guides</dt><dd>{progress.updates.prices.toLocaleString()}</dd></div>
            </dl>
          </section>
        )}
        <div className="batch-actions">
          {running ? <button className="button secondary" disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true); }}><Pause size={16} /> {stopping ? "Stopping…" : "Stop after this Pop"}</button> : confirmBatch ? <><button className="button primary" onClick={() => runBatch(false)}><Sparkles size={16} /> Start {due.length.toLocaleString()} checks</button><button className="button ghost" onClick={() => setConfirmBatch(false)}>Cancel</button></> : <button className="button primary" onClick={() => setConfirmBatch(true)} disabled={!due.length}><Sparkles size={16} /> Find info for all due Pops</button>}
          {!running && due.length === 0 && <button className="button ghost" onClick={() => runBatch(true)}><RotateCcw size={15} /> Refresh every Pop now</button>}
        </div>
      </section>
    </div>
  );
}
