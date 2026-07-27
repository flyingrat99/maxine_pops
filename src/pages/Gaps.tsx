import { AlertTriangle, Check, Heart, ImageIcon, LoaderCircle, Plus, SearchCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SearchField } from "../components/Common";
import { createLocalId, normalizeText } from "../lib";
import { useTracker } from "../store";
import type { CatalogEntry, PopItem } from "../types";

interface NumberRun {
  key: string;
  numbers: number[];
  min: number;
  max: number;
  missing: number[];
  coverage: number;
}

function detectNumberRuns(rawNumbers: number[]): NumberRun[] {
  const numbers = [...new Set(rawNumbers)].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let cluster: number[] = [];

  numbers.forEach((number) => {
    const previous = cluster.at(-1);
    const startsNewRun = previous !== undefined && (number - previous > 40 || number - cluster[0] > 200);
    if (startsNewRun) {
      clusters.push(cluster);
      cluster = [];
    }
    cluster.push(number);
  });
  if (cluster.length) clusters.push(cluster);

  return clusters.filter((values) => values.length >= 2).map((values) => {
    const min = values[0];
    const max = values[values.length - 1];
    const ownedSet = new Set(values);
    const missing = Array.from({ length: max - min + 1 }, (_, index) => min + index).filter((number) => !ownedSet.has(number));
    return {
      key: `${min}-${max}`,
      numbers: values,
      min,
      max,
      missing,
      coverage: Math.round((values.length / (max - min + 1)) * 100),
    };
  });
}

function wishlistItem(name: string, number: string, series: string, catalog: CatalogEntry | null): PopItem {
  return {
    id: createLocalId(),
    name,
    number,
    series,
    category: catalog?.series.includes("Pop! Marvel") ? "Marvel" : "Others",
    status: "wishlist",
    quantity: 1,
    condition: "Near mint",
    comments: catalog ? "Added from the open catalog explorer; verify the exact box number and variant." : "Number-gap placeholder; identify the exact Pop and variant.",
    funkoApp: "",
    hobbyDb: "",
    favorite: false,
    location: "",
    purchasePrice: null,
    estimatedValue: null,
    askingPrice: null,
    valuationSource: "",
    valuedAt: "",
    catalogMatch: catalog ? { title: catalog.title, imageUrl: catalog.imageUrl, series: catalog.series, confidence: 1 } : null,
    customImageUrl: "",
    sourceRef: catalog ? "Added from open catalog" : "Added from gap finder",
  };
}

function CatalogImage({ entry, imageUrl }: { entry: CatalogEntry; imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) {
    return <div className="catalog-image-fallback"><ImageIcon size={30} /><span>Image unavailable</span></div>;
  }
  return <img src={imageUrl} alt={entry.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

interface GapsProps {
  onNotify: (message: string) => void;
  onViewWishlist: () => void;
}

export function Gaps({ onNotify, onViewWishlist }: GapsProps) {
  const { state, addItem } = useTracker();
  const owned = useMemo(() => state.items.filter((item) => item.status === "owned"), [state.items]);
  const wishlist = useMemo(() => state.items.filter((item) => item.status === "wishlist"), [state.items]);
  const seriesOptions = useMemo(() => {
    const counts = new Map<string, number>();
    owned.filter((item) => /^\d+$/.test(item.number)).forEach((item) => counts.set(item.series, (counts.get(item.series) ?? 0) + 1));
    return [...counts].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]);
  }, [owned]);
  const [selectedSeries, setSelectedSeries] = useState("");
  const [selectedRunKey, setSelectedRunKey] = useState("");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [lastCatalogAddition, setLastCatalogAddition] = useState("");

  useEffect(() => {
    if (!selectedSeries && seriesOptions.length) {
      const useful = seriesOptions.find(([series]) => {
        const numbers = owned.filter((item) => item.series === series && /^\d+$/.test(item.number)).map((item) => Number(item.number));
        return Math.max(...numbers) - Math.min(...numbers) <= 500;
      });
      setSelectedSeries((useful ?? seriesOptions[0])[0]);
    }
  }, [selectedSeries, seriesOptions, owned]);

  useEffect(() => {
    fetch("./data/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the open catalog.");
        return response.json() as Promise<CatalogEntry[]>;
      })
      .then(setCatalog)
      .catch((error) => setCatalogError(error instanceof Error ? error.message : "Could not load the open catalog."))
      .finally(() => setCatalogLoading(false));
  }, []);

  const seriesNumbers = useMemo(() => {
    const entries = owned.filter((item) => item.series === selectedSeries && /^\d+$/.test(item.number));
    return [...new Set(entries.map((item) => Number(item.number)))].sort((a, b) => a - b);
  }, [owned, selectedSeries]);

  const numberRuns = useMemo(() => detectNumberRuns(seriesNumbers), [seriesNumbers]);
  const bestRun = useMemo(() => [...numberRuns].sort((a, b) => b.numbers.length - a.numbers.length || b.coverage - a.coverage)[0], [numberRuns]);
  const gapData = numberRuns.find((run) => run.key === selectedRunKey) ?? bestRun;
  const includedNumberCount = useMemo(() => new Set(numberRuns.flatMap((run) => run.numbers)).size, [numberRuns]);
  const isolatedNumberCount = seriesNumbers.length - includedNumberCount;

  const catalogResults = useMemo(() => {
    const query = normalizeText(catalogSearch);
    if (query.length < 2) return [];
    const words = query.split(" ");
    const ownedNames = new Set(owned.map((item) => normalizeText(item.name)));
    const wishedNames = new Set(wishlist.map((item) => normalizeText(item.name)));
    return catalog.filter((entry) => {
      const haystack = normalizeText(`${entry.title} ${entry.series.join(" ")}`);
      return words.every((word) => haystack.includes(word)) && !ownedNames.has(normalizeText(entry.title));
    }).sort((a, b) => Number(wishedNames.has(normalizeText(b.title))) - Number(wishedNames.has(normalizeText(a.title)))).slice(0, 36);
  }, [catalog, catalogSearch, owned, wishlist]);

  const addGap = (number: number) => {
    const key = `gap-${selectedSeries}-${number}`;
    addItem(wishlistItem(`Missing ${selectedSeries} Pop`, String(number), selectedSeries, null));
    setAdded((current) => new Set(current).add(key));
    onNotify(`#${number} added to the wishlist. Wishlist now has ${wishlist.length + 1} items.`);
  };

  const addCatalog = (entry: CatalogEntry) => {
    addItem(wishlistItem(entry.title, "", entry.series.find((value) => !value.startsWith("Pop! ")) || entry.series.at(-1) || "Open catalog", entry));
    setAdded((current) => new Set(current).add(entry.handle + entry.title));
    setLastCatalogAddition(entry.title);
    onNotify(`${entry.title} added to the wishlist. Wishlist now has ${wishlist.length + 1} items.`);
  };

  return (
    <div className="gaps-page">
      <PageHeader eyebrow="COMPLETE THE RUN" title="Gap finder" description="Use Maxine’s own box-number runs for shelf gaps, then explore unowned candidates from the open 2021 catalog." />
      <div className="gap-layout">
        <section className="panel number-gap-panel">
          <div className="panel-heading"><div><span className="eyebrow red">NUMBER RUN</span><h2>Missing box numbers</h2></div><SearchCheck /></div>
          <label className="large-select"><span>Choose a series</span><select value={selectedSeries} onChange={(event) => { setSelectedSeries(event.target.value); setSelectedRunKey(""); }}>{seriesOptions.map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select></label>
          {numberRuns.length > 1 && <label className="large-select run-select"><span>Choose a detected number run</span><select value={gapData?.key ?? ""} onChange={(event) => setSelectedRunKey(event.target.value)}>{numberRuns.map((run) => <option key={run.key} value={run.key}>#{run.min}–#{run.max} ({run.numbers.length} owned)</option>)}</select></label>}
          {gapData ? (
            <>
              <div className="completion-score"><div><strong>{gapData.coverage}%</strong><span>number-run coverage</span></div><p>Owned {gapData.numbers.length} unique numbers in the detected #{gapData.min}–#{gapData.max} run.</p></div>
              <div className="gap-progress"><span style={{ width: `${gapData.coverage}%` }} /></div>
              <div className="inline-alert neutral"><AlertTriangle size={17} /><p>Large series are split into nearby number runs, avoiding hundreds of false gaps between release eras. Box numbers are not always continuous, so treat these as leads to verify—not a canonical checklist. Use “Find image” to identify a number before wishlisting it.{isolatedNumberCount > 0 ? ` ${isolatedNumberCount} isolated number${isolatedNumberCount === 1 ? " was" : "s were"} left out of the detected runs.` : ""}</p></div>
              {gapData.missing.length ? (
                <div className="gap-number-grid">
                  {gapData.missing.map((number) => {
                    const key = `gap-${selectedSeries}-${number}`;
                    const wished = wishlist.some((item) => item.number === String(number) && (item.series === selectedSeries || item.series.includes("wishlist")));
                    const isAdded = added.has(key);
                    const imageSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`Funko Pop ${selectedSeries} ${number}`)}`;
                    return (
                      <article key={number} className={`gap-number-card ${wished || isAdded ? "wished" : ""}`}>
                        <a href={imageSearchUrl} target="_blank" rel="noreferrer" className="gap-image-lookup" title={`Find images for ${selectedSeries} #${number}`}>
                          <ImageIcon size={19} />
                          <strong>#{number}</strong>
                          <span>Find image</span>
                        </a>
                        <button disabled={wished || isAdded} onClick={() => addGap(number)}>{wished || isAdded ? <><Heart size={12} fill="currentColor" /> Listed</> : <><Plus size={12} /> Wishlist</>}</button>
                      </article>
                    );
                  })}
                </div>
              ) : <div className="all-clear"><Check /> No gaps inside this recorded number range.</div>}
            </>
          ) : seriesNumbers.length > 0 ? <div className="empty-mini">These box numbers are too far apart to infer a reliable local run. Try the open catalog search instead.</div> : null}
        </section>

        <section className="panel catalog-explorer">
          <div className="panel-heading"><div><span className="eyebrow red">OPEN CATALOG</span><h2>Discover candidates</h2></div><Sparkles /></div>
          <p>Search 10,678 Pop! Vinyl records from the Kenny Chan dataset. It has useful titles and images, but no box numbers or current prices.</p>
          {lastCatalogAddition && <div className="inline-alert success compact catalog-confirmation" role="status"><Check size={17} /><p><strong>{lastCatalogAddition}</strong> was added. Your wishlist now contains {wishlist.length.toLocaleString()} items.</p><button onClick={onViewWishlist}>View wishlist</button></div>}
          <SearchField value={catalogSearch} onChange={setCatalogSearch} placeholder="Try a character or catalog series…" />
          {catalogLoading && <div className="loading-state"><LoaderCircle className="spin" /> Loading catalog…</div>}
          {catalogError && <div className="inline-alert warning"><AlertTriangle /><p>{catalogError}</p></div>}
          {!catalogLoading && !catalogSearch && <div className="catalog-prompt"><SearchCheck /><p>Search for “What If”, “Iron Man”, “Harry Potter”, or another character.</p></div>}
          {catalogSearch.length >= 2 && !catalogResults.length && <div className="empty-mini">No unowned catalog candidates matched that search.</div>}
          <div className="catalog-grid">
            {catalogResults.map((entry) => {
              const key = entry.handle + entry.title;
              const alreadyWished = wishlist.some((item) => normalizeText(item.name) === normalizeText(entry.title));
              const isAdded = added.has(key);
              const imageUrl = entry.imageUrl.includes("images.hobbydb.com") && state.settings.imageProxy ? `https://wsrv.nl/?url=${encodeURIComponent(entry.imageUrl)}&w=520&h=520&fit=contain&we` : entry.imageUrl;
              return (
                <article key={key} className="catalog-card">
                  <div className="catalog-image"><CatalogImage entry={entry} imageUrl={imageUrl} /></div>
                  <div><h3>{entry.title}</h3><p>{entry.series.filter((value) => value !== "Pop! Vinyl").slice(0, 2).join(" · ") || "Pop! Vinyl"}</p></div>
                  <button disabled={alreadyWished || isAdded} onClick={() => addCatalog(entry)}>{isAdded ? <><Check size={14} /> Added to wishlist</> : alreadyWished ? <><Check size={14} /> On wishlist</> : <><Plus size={14} /> Add to wishlist</>}</button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
