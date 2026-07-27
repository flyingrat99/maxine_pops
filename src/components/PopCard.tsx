import { Edit3, Heart, MapPin, PackageCheck, Sparkles } from "lucide-react";
import { formatMoney } from "../lib";
import type { PopItem } from "../types";
import { PopImage } from "./PopImage";

interface PopCardProps {
  item: PopItem;
  currency: string;
  useProxy: boolean;
  onEdit: (item: PopItem) => void;
  onToggleFavorite: (item: PopItem) => void;
  compact?: boolean;
}

export function PopCard({ item, currency, useProxy, onEdit, onToggleFavorite, compact = false }: PopCardProps) {
  const recordedValue = item.status === "sale" ? item.askingPrice ?? item.estimatedValue : item.estimatedValue;
  const referenceValue = item.condition === "Out of box" ? item.referencePrices?.outOfBox : item.condition === "Box damaged" ? item.referencePrices?.damagedBox : item.referencePrices?.newInBox;
  const value = recordedValue ?? referenceValue ?? null;
  const valueCurrency = recordedValue !== null ? currency : item.referencePrices?.currency ?? currency;
  const valueLabel = item.status === "sale" && item.askingPrice !== null ? "ASKING" : item.estimatedValue !== null ? "EST. VALUE" : referenceValue !== null && referenceValue !== undefined ? item.condition === "Out of box" ? "OUT-OF-BOX REF." : item.condition === "Box damaged" ? "DAMAGED-BOX REF." : "NEW / SEALED REF." : "EST. VALUE";
  return (
    <article className={`pop-card ${compact ? "compact" : ""}`}>
      <button className="pop-card-image" onClick={() => onEdit(item)} aria-label={`Open ${item.name}`}>
        <PopImage item={item} useProxy={useProxy} />
        {item.quantity > 1 && <span className="quantity-badge">×{item.quantity}</span>}
        {item.catalogMatch && !item.customImageUrl && <span className="match-badge" title="Suggested from the 2021 open catalog"><Sparkles size={12} /> catalog</span>}
      </button>
      <div className="pop-card-body">
        <div className="pop-card-topline">
          <span className={`category-pill ${item.category.toLowerCase()}`}>{item.category}</span>
          <button
            className={`favorite-button ${item.favorite ? "selected" : ""}`}
            onClick={() => onToggleFavorite({ ...item, favorite: !item.favorite })}
            aria-label={item.favorite ? "Remove from favourites" : "Add to favourites"}
          >
            <Heart size={18} fill={item.favorite ? "currentColor" : "none"} />
          </button>
        </div>
        <button className="pop-title-button" onClick={() => onEdit(item)}>
          <h3>{item.name}</h3>
        </button>
        <div className="series-line">
          {item.number && <strong>#{item.number}</strong>}
          <span>{item.series}</span>
        </div>
        <div className="card-meta">
          <span><PackageCheck size={14} /> {item.condition}</span>
          {item.location && <span><MapPin size={14} /> {item.location}</span>}
        </div>
        <div className="pop-card-footer">
          <div>
            <small>{valueLabel}</small>
            <strong className={value === null ? "muted-value" : ""}>{formatMoney(value, valueCurrency)}</strong>
          </div>
          <button className="edit-button" onClick={() => onEdit(item)}><Edit3 size={16} /> Edit</button>
        </div>
      </div>
    </article>
  );
}
