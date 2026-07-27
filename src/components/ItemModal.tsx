import { AlertTriangle, ExternalLink, Heart, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { conditionOptions, createLocalId, extractFunkoItemNumber, mergeProductInfo, parsePrice, statusLabels } from "../lib";
import type { Category, Condition, ItemStatus, PopItem } from "../types";
import { InfoFinder } from "./InfoFinder";
import { PopImage } from "./PopImage";

function blankItem(status: ItemStatus): PopItem {
  return {
    id: createLocalId(),
    name: "",
    number: "",
    series: status === "wishlist" ? "Wishlist" : "Unsorted",
    category: "Marvel",
    status,
    quantity: 1,
    condition: "Near mint",
    comments: "",
    funkoApp: "",
    hobbyDb: "",
    sku: "",
    upc: "",
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
    catalogMatch: null,
    customImageUrl: "",
    sourceRef: "Added in app",
  };
}

interface ItemModalProps {
  item: PopItem | null;
  initialStatus: ItemStatus;
  currency: string;
  useProxy: boolean;
  onClose: () => void;
  onSave: (item: PopItem, isNew: boolean) => void;
  onDelete: (item: PopItem) => void;
}

export function ItemModal({ item, initialStatus, currency, useProxy, onClose, onSave, onDelete }: ItemModalProps) {
  const isNew = item === null;
  const [draft, setDraft] = useState<PopItem>(() => item ? {
    ...structuredClone(item),
    sku: item.sku ?? "",
    upc: item.upc ?? "",
    description: item.description ?? "",
    releaseDate: item.releaseDate ?? "",
    referencePrices: item.referencePrices ?? null,
    infoSources: item.infoSources ?? [],
    infoCheckedAt: item.infoCheckedAt ?? "",
  } : blankItem(initialStatus));
  const [deleteArmed, setDeleteArmed] = useState(false);
  const funkoItemNumber = useMemo(() => extractFunkoItemNumber(draft.sku) || extractFunkoItemNumber(draft.upc), [draft.sku, draft.upc]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextValue = parsePrice(data.get("estimatedValue"));
    const valueChanged = nextValue !== draft.estimatedValue;
    onSave({
      ...draft,
      name: String(data.get("name") || "").trim(),
      number: String(data.get("number") || "").trim(),
      series: String(data.get("series") || "Unsorted").trim() || "Unsorted",
      category: data.get("category") as Category,
      status: data.get("status") as ItemStatus,
      quantity: Math.max(1, Number(data.get("quantity")) || 1),
      condition: data.get("condition") as Condition,
      location: String(data.get("location") || "").trim(),
      comments: String(data.get("comments") || "").trim(),
      sku: String(data.get("sku") || "").trim().toUpperCase(),
      upc: String(data.get("upc") || "").replace(/\D/g, ""),
      description: String(data.get("description") || "").trim(),
      releaseDate: String(data.get("releaseDate") || "").trim(),
      customImageUrl: String(data.get("customImageUrl") || "").trim(),
      purchasePrice: parsePrice(data.get("purchasePrice")),
      estimatedValue: nextValue,
      askingPrice: parsePrice(data.get("askingPrice")),
      valuationSource: String(data.get("valuationSource") || "").trim(),
      valuedAt: valueChanged && nextValue !== null ? new Date().toISOString().slice(0, 10) : draft.valuedAt,
      targetSeller: String(data.get("targetSeller") || "").trim(),
      targetPriceNote: String(data.get("targetPriceNote") || "").trim(),
    }, isNew);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="item-modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <header className="modal-header">
          <div>
            <span className="eyebrow red">{isNew ? "ADD A POP" : draft.sourceRef}</span>
            <h2 id="item-modal-title">{isNew ? "New collection record" : draft.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </header>
        <div className="modal-layout">
          <form id="item-form" className="item-form" onSubmit={submit}>
            <div className="edit-image-preview">
              <PopImage item={draft} useProxy={useProxy} eager />
              <button type="button" className={`favorite-toggle ${draft.favorite ? "selected" : ""}`} onClick={() => setDraft((current) => ({ ...current, favorite: !current.favorite }))}>
                <Heart size={17} fill={draft.favorite ? "currentColor" : "none"} /> {draft.favorite ? "Favourite" : "Mark favourite"}
              </button>
            </div>
            <div className="form-fields">
              <div className="field-grid two">
                <label><span>Name</span><input name="name" required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} autoFocus={isNew} /></label>
                <label><span>Box number</span><input name="number" value={draft.number} onChange={(event) => setDraft((current) => ({ ...current, number: event.target.value }))} /></label>
              </div>
              <label><span>Series / collection</span><input name="series" value={draft.series} onChange={(event) => setDraft((current) => ({ ...current, series: event.target.value }))} /></label>
              <div className="field-grid two identifier-fields">
                <label><span>SKU / Funko item ID</span><input name="sku" value={draft.sku} onChange={(event) => setDraft((current) => ({ ...current, sku: event.target.value }))} placeholder="e.g. FUN82769 or 82769" autoComplete="off" /></label>
                <label><span>UPC / EAN barcode</span><input name="upc" value={draft.upc} onChange={(event) => setDraft((current) => ({ ...current, upc: event.target.value.replace(/[^\d\s-]/g, "") }))} placeholder="e.g. 889698827690" inputMode="numeric" autoComplete="off" /></label>
              </div>
              {funkoItemNumber && <div className="identifier-note"><span>Funko item {funkoItemNumber} detected—identifier searches are now prioritised.</span><a href={`https://funko.com/search/?q=${encodeURIComponent(funkoItemNumber)}`} target="_blank" rel="noreferrer">Open official Funko result <ExternalLink size={12} /></a></div>}
              <div className="field-grid three">
                <label><span>Category</span><select name="category" defaultValue={draft.category}><option>Marvel</option><option>Others</option></select></label>
                <label><span>List</span><select name="status" defaultValue={draft.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Quantity</span><input name="quantity" type="number" min="1" defaultValue={draft.quantity} /></label>
              </div>
              <div className="field-grid two">
                <label><span>Condition</span><select name="condition" defaultValue={draft.condition}>{conditionOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label><span>Shelf / location</span><input name="location" defaultValue={draft.location} placeholder="e.g. Cabinet A · shelf 2" /></label>
              </div>
              <label><span>Image or product page URL</span><input name="customImageUrl" type="url" value={draft.customImageUrl} onChange={(event) => setDraft((current) => ({ ...current, customImageUrl: event.target.value }))} placeholder="Paste an image, Amazon, Funko, PriceCharting, or retailer URL" /><small className="field-help">Amazon AU, Funko, and PriceCharting product pages can supply information and a preview image. Some protected retailer pages may require choosing an image from the market results.</small></label>
              {draft.catalogMatch && !draft.customImageUrl && (
                <div className="catalog-note">
                  <AlertTriangle size={16} />
                  <span>Suggested match: <strong>{draft.catalogMatch.title}</strong> ({Math.round(draft.catalogMatch.confidence * 100)}%). Verify variants and stickers.</span>
                </div>
              )}
              <label><span>Description</span><textarea name="description" rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Character, pose, edition and official product details…" /></label>
              <label><span>Release date</span><input name="releaseDate" value={draft.releaseDate} onChange={(event) => setDraft((current) => ({ ...current, releaseDate: event.target.value }))} placeholder="e.g. January 1, 2011" /></label>
              <label><span>Notes</span><textarea name="comments" rows={3} defaultValue={draft.comments} placeholder="Sticker, box marks, protector, purchase story…" /></label>

              <div className="form-section-title"><span>Value & trade</span><small>Amounts are recorded in {currency}; no automatic currency conversion.</small></div>
              <div className="field-grid three">
                <label><span>Paid ({currency})</span><input name="purchasePrice" type="number" min="0" step="0.01" defaultValue={draft.purchasePrice ?? ""} /></label>
                <label><span>Est. value ({currency})</span><input name="estimatedValue" type="number" min="0" step="0.01" value={draft.estimatedValue ?? ""} onChange={(event) => setDraft((current) => ({ ...current, estimatedValue: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
                <label><span>Asking ({currency})</span><input name="askingPrice" type="number" min="0" step="0.01" defaultValue={draft.askingPrice ?? ""} /></label>
              </div>
              <label><span>Valuation source</span><input name="valuationSource" value={draft.valuationSource} onChange={(event) => setDraft((current) => ({ ...current, valuationSource: event.target.value }))} placeholder="e.g. Trade Me sold comp, PPG, personal estimate" /></label>
              {draft.referencePrices && (
                <div className="saved-reference-note">
                  <strong>Saved reference prices ({draft.referencePrices.currency})</strong>
                  <span>Out of box {draft.referencePrices.outOfBox ?? "—"} · damaged box {draft.referencePrices.damagedBox ?? "—"} · new {draft.referencePrices.newInBox ?? "—"}</span>
                  <a href={draft.referencePrices.sourceUrl} target="_blank" rel="noreferrer">Open {draft.referencePrices.source} <ExternalLink size={12} /></a>
                </div>
              )}
              {draft.status === "wishlist" && (
                <div className="field-grid two">
                  <label><span>Seller spotted</span><input name="targetSeller" defaultValue={draft.targetSeller} /></label>
                  <label><span>Price note</span><input name="targetPriceNote" defaultValue={draft.targetPriceNote} /></label>
                </div>
              )}
            </div>
          </form>
          <aside className="modal-market-column">
            <InfoFinder item={draft} onApply={(result) => setDraft((current) => mergeProductInfo(current, result, true))} />
          </aside>
        </div>
        <footer className="modal-footer">
          {!isNew && (
            deleteArmed ? (
              <div className="delete-confirm"><span>Remove this record?</span><button className="button danger" onClick={() => onDelete(draft)}>Yes, remove</button><button className="button ghost" onClick={() => setDeleteArmed(false)}>Cancel</button></div>
            ) : <button className="button ghost danger-text" onClick={() => setDeleteArmed(true)}><Trash2 size={16} /> Remove</button>
          )}
          <div className="footer-actions">
            <button className="button ghost" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" form="item-form"><Save size={17} /> Save pop</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
