import { Boxes, Filter, Grid2X2, Heart, ListFilter, Plus, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, PageHeader, SearchField } from "../components/Common";
import { PopCard } from "../components/PopCard";
import { normalizeText } from "../lib";
import { useTracker } from "../store";
import type { ItemStatus, PopItem } from "../types";

const PAGE_SIZE = 48;

export function Library({ status, onAdd, onEdit }: { status: ItemStatus; onAdd: () => void; onEdit: (item: PopItem) => void }) {
  const { state, updateItem } = useTracker();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | "Marvel" | "Others">("All");
  const [series, setSeries] = useState("All");
  const [sort, setSort] = useState("number");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [page, setPage] = useState(1);

  const copy = status === "owned"
    ? { eyebrow: "THE COLLECTION", title: "Maxine’s Pops", description: "Browse every imported Pop, verify suggested images, and add the details that make each box unique.", icon: <Boxes /> }
    : status === "wishlist"
      ? { eyebrow: "THE HUNT", title: "Wishlist", description: "The next heroes, grails, and missing numbers Maxine is keeping an eye on.", icon: <Heart /> }
      : { eyebrow: "THE TRADE DESK", title: "For sale", description: "Price the trade pile, check the market, and keep asking prices and condition notes together.", icon: <Store /> };

  const baseItems = useMemo(() => state.items.filter((item) => item.status === status), [state.items, status]);
  const seriesOptions = useMemo(() => [...new Set(baseItems.map((item) => item.series).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [baseItems]);
  const filtered = useMemo(() => {
    const needle = normalizeText(search);
    return baseItems
      .filter((item) => category === "All" || item.category === category)
      .filter((item) => series === "All" || item.series === series)
      .filter((item) => !onlyFavorites || item.favorite)
      .filter((item) => !needle || normalizeText(`${item.name} ${item.number} ${item.series} ${item.sku} ${item.upc} ${item.description} ${item.comments}`).includes(needle))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "series") return a.series.localeCompare(b.series) || a.name.localeCompare(b.name);
        if (sort === "value") return (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1);
        if (sort === "asking") return (b.askingPrice ?? -1) - (a.askingPrice ?? -1);
        return (Number(a.number) || 999999) - (Number(b.number) || 999999) || a.name.localeCompare(b.name);
      });
  }, [baseItems, category, series, onlyFavorites, search, sort]);

  useEffect(() => setPage(1), [search, category, series, sort, onlyFavorites, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="library-page">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<button className="button primary" onClick={onAdd}><Plus size={17} /> Add a Pop</button>} />
      <section className="filter-bar">
        <SearchField value={search} onChange={setSearch} placeholder={`Search ${baseItems.length.toLocaleString()} records…`} />
        <div className="filter-controls">
          <label className="select-control"><ListFilter size={16} /><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option>All</option><option>Marvel</option><option>Others</option></select></label>
          <label className="select-control wide"><Filter size={16} /><select value={series} onChange={(event) => setSeries(event.target.value)}><option>All</option>{seriesOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="select-control"><Grid2X2 size={16} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="number">Box number</option><option value="name">Name</option><option value="series">Series</option><option value="value">Est. value</option>{status === "sale" && <option value="asking">Asking price</option>}</select></label>
          <button className={`filter-toggle ${onlyFavorites ? "active" : ""}`} onClick={() => setOnlyFavorites((value) => !value)}><Heart size={16} fill={onlyFavorites ? "currentColor" : "none"} /> Favourites</button>
        </div>
      </section>
      <div className="results-line"><strong>{filtered.length.toLocaleString()}</strong> results {filtered.length !== baseItems.length && <span>from {baseItems.length.toLocaleString()}</span>}</div>
      {visible.length ? (
        <div className="pop-grid">
          {visible.map((item) => <PopCard key={item.id} item={item} currency={state.settings.currency} useProxy={state.settings.imageProxy} onEdit={onEdit} onToggleFavorite={updateItem} compact={status !== "owned"} />)}
        </div>
      ) : (
        <EmptyState icon={copy.icon} title="No Pops found" body="Try a different search or filter, or add a new record." action={<button className="button primary" onClick={onAdd}><Plus size={16} /> Add a Pop</button>} />
      )}
      {pageCount > 1 && (
        <nav className="pagination" aria-label="Results pages">
          <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page <strong>{page}</strong> of {pageCount}</span>
          <button disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}
