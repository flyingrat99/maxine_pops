import { ArrowRight, BadgeDollarSign, Boxes, CircleDollarSign, Heart, Plus, Sparkles, Store, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { formatMoney, normalizeText } from "../lib";
import { useTracker } from "../store";
import type { ItemStatus, PageId } from "../types";
import { PopImage } from "../components/PopImage";
import { ProgressBar } from "../components/Common";

export function Dashboard({ onNavigate, onAdd, onEdit }: { onNavigate: (page: PageId) => void; onAdd: (status: ItemStatus) => void; onEdit: (id: string) => void }) {
  const { state } = useTracker();
  const { items, settings } = state;
  const stats = useMemo(() => {
    const owned = items.filter((item) => item.status === "owned");
    const wishlist = items.filter((item) => item.status === "wishlist");
    const sale = items.filter((item) => item.status === "sale");
    const units = owned.reduce((sum, item) => sum + item.quantity, 0);
    const value = owned.reduce((sum, item) => sum + (item.estimatedValue ?? 0) * item.quantity, 0);
    const cost = owned.reduce((sum, item) => sum + (item.purchasePrice ?? 0) * item.quantity, 0);
    const asking = sale.reduce((sum, item) => sum + (item.askingPrice ?? 0) * item.quantity, 0);
    const valued = owned.filter((item) => item.estimatedValue !== null).length;
    const marvel = owned.filter((item) => item.category === "Marvel").length;
    const others = owned.length - marvel;
    const grouped = new Map<string, number>();
    owned.forEach((item) => grouped.set(item.series || "Unsorted", (grouped.get(item.series || "Unsorted") ?? 0) + item.quantity));
    const topSeries = [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const duplicateKeys = new Map<string, number>();
    owned.forEach((item) => {
      const key = `${normalizeText(item.name)}|${item.number}`;
      duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + item.quantity);
    });
    const duplicates = [...duplicateKeys.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
    const referenceMap = new Map<string, { currency: string; records: number; outOfBox: number; damagedBox: number; newInBox: number }>();
    owned.forEach((item) => {
      const prices = item.referencePrices;
      if (!prices) return;
      const current = referenceMap.get(prices.currency) ?? { currency: prices.currency, records: 0, outOfBox: 0, damagedBox: 0, newInBox: 0 };
      current.records += 1;
      current.outOfBox += (prices.outOfBox ?? 0) * item.quantity;
      current.damagedBox += (prices.damagedBox ?? 0) * item.quantity;
      current.newInBox += (prices.newInBox ?? 0) * item.quantity;
      referenceMap.set(prices.currency, current);
    });
    const referenceTotals = [...referenceMap.values()].sort((a, b) => b.records - a.records);
    return { owned, wishlist, sale, units, value, cost, asking, valued, marvel, others, topSeries, duplicates, referenceTotals };
  }, [items]);

  const spotlight = stats.owned.filter((item) => item.favorite).slice(0, 4);
  const featured = spotlight.length ? spotlight : stats.owned.filter((item) => item.catalogMatch).slice(0, 4);

  return (
    <div className="dashboard-page">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-kicker"><Sparkles size={15} /> MAXINE’S COLLECTION HQ</span>
          <h1>Every hero.<br /><em>One epic collection.</em></h1>
          <p>Track the shelf, hunt the gaps, price the gems, and find the next Pop worth chasing.</p>
          <div className="hero-actions">
            <button className="button light" onClick={() => onNavigate("collection")}>Explore collection <ArrowRight size={17} /></button>
            <button className="button hero-outline" onClick={() => onNavigate("finder")}><Sparkles size={17} /> Find Pop info</button>
            <button className="button hero-outline" onClick={() => onAdd("owned")}><Plus size={17} /> Add a Pop</button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <span className="burst burst-one">POW!</span>
          <div className="hero-box"><span>M</span><small>POP!</small></div>
          <span className="burst burst-two">WOW!</span>
        </div>
      </section>

      <section className="stat-grid">
        <button className="stat-card primary-stat" onClick={() => onNavigate("collection")}>
          <span className="stat-icon"><Boxes /></span><small>COLLECTION</small><strong>{stats.units.toLocaleString()}</strong><p>{stats.owned.length.toLocaleString()} records · {stats.duplicates} extras</p>
        </button>
        <button className="stat-card" onClick={() => onNavigate("wishlist")}>
          <span className="stat-icon pink"><Heart /></span><small>WISHLIST</small><strong>{stats.wishlist.length.toLocaleString()}</strong><p>waiting to join the shelf</p>
        </button>
        <button className="stat-card" onClick={() => onNavigate("sale")}>
          <span className="stat-icon gold"><Store /></span><small>TRADE PILE</small><strong>{stats.sale.length.toLocaleString()}</strong><p>{stats.asking > 0 ? `${formatMoney(stats.asking, settings.currency)} asking` : "ready to price"}</p>
        </button>
        <button className="stat-card" onClick={() => onNavigate("collection")}>
          <span className="stat-icon teal"><CircleDollarSign /></span><small>EST. VALUE</small><strong>{formatMoney(stats.value, settings.currency)}</strong><p>{stats.valued} of {stats.owned.length} records valued</p>
        </button>
      </section>

      <section className="dashboard-grid">
        <article className="panel collection-mix">
          <div className="panel-heading"><div><span className="eyebrow red">THE SHELF</span><h2>Collection mix</h2></div><BadgeDollarSign /></div>
          <div className="mix-total"><strong>{stats.units.toLocaleString()}</strong><span>total Pops</span></div>
          <div className="mix-bar"><span style={{ width: `${Math.round((stats.marvel / Math.max(stats.owned.length, 1)) * 100)}%` }} /></div>
          <div className="mix-legend">
            <div><span className="dot marvel-dot" /><p><strong>{stats.marvel}</strong> Marvel</p></div>
            <div><span className="dot other-dot" /><p><strong>{stats.others}</strong> Others</p></div>
          </div>
          <div className="valuation-progress">
            <ProgressBar value={stats.valued} max={stats.owned.length} label="Valuation coverage" />
            <p>{stats.valued === 0 ? "Open any Pop to record a price check." : `${stats.owned.length - stats.valued} records still need an estimate.`}</p>
          </div>
        </article>

        <article className="panel top-series-panel">
          <div className="panel-heading"><div><span className="eyebrow red">TOP RUNS</span><h2>Biggest series</h2></div><TrendingUp /></div>
          <ol className="series-ranking">
            {stats.topSeries.map(([series, count], index) => (
              <li key={series}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="series-name">{series}</span><strong>{count}</strong></li>
            ))}
          </ol>
          <button className="text-button" onClick={() => onNavigate("gaps")}>Find missing numbers <ArrowRight size={14} /></button>
        </article>

        <article className="panel value-panel">
          <div className="panel-heading"><div><span className="eyebrow red">VALUE DESK</span><h2>Know the numbers</h2></div><CircleDollarSign /></div>
          <div className="value-row"><span>Recorded value</span><strong>{formatMoney(stats.value, settings.currency)}</strong></div>
          <div className="value-row"><span>Recorded cost</span><strong>{formatMoney(stats.cost, settings.currency)}</strong></div>
          <div className="value-row accent"><span>Paper gain / loss</span><strong>{formatMoney(stats.value - stats.cost, settings.currency)}</strong></div>
          {stats.referenceTotals.map((reference) => (
            <div className="collection-reference" key={reference.currency}>
              <small>PRICE GUIDE · {reference.records} RECORDS · {reference.currency}</small>
              <span><em>Out of box</em><strong>{formatMoney(reference.outOfBox, reference.currency)}</strong></span>
              <span><em>Damaged box</em><strong>{formatMoney(reference.damagedBox, reference.currency)}</strong></span>
              <span><em>New / sealed</em><strong>{formatMoney(reference.newInBox, reference.currency)}</strong></span>
            </div>
          ))}
          <p className="fine-print">Totals only include Pops with amounts entered. Estimated value is not a guaranteed sale price.</p>
          <button className="button secondary full" onClick={() => onNavigate("finder")}>Enrich the whole library</button>
        </article>
      </section>

      <section className="spotlight-section">
        <div className="section-title-row"><div><span className="eyebrow red">SPOTLIGHT</span><h2>{spotlight.length ? "Maxine’s favourites" : "From the collection"}</h2></div><button className="text-button" onClick={() => onNavigate("collection")}>View all <ArrowRight size={14} /></button></div>
        <div className="spotlight-grid">
          {featured.map((item) => (
            <button className="spotlight-card" key={item.id} onClick={() => onEdit(item.id)}>
              <div className="spotlight-image"><PopImage item={item} useProxy={settings.imageProxy} /></div>
              <div><span>{item.number ? `#${item.number}` : item.category}</span><h3>{item.name}</h3><p>{item.series}</p></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
