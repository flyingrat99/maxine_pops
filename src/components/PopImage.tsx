import { useEffect, useMemo, useState } from "react";
import { getImageUrl } from "../lib";
import type { PopItem } from "../types";

export function PopImage({ item, useProxy, eager = false }: { item: PopItem; useProxy: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getImageUrl(item, useProxy);
  const initials = useMemo(() => item.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(), [item.name]);

  useEffect(() => setFailed(false), [imageUrl]);

  if (!imageUrl || failed) {
    return (
      <div className="pop-placeholder" aria-label={`No confirmed image for ${item.name}`}>
        <div className="placeholder-box">
          <span>{initials || "POP"}</span>
          <small>IMAGE<br />NEEDED</small>
        </div>
      </div>
    );
  }

  return (
    <img
      className="pop-image"
      src={imageUrl}
      alt={item.catalogMatch && !item.customImageUrl ? `Suggested catalog image: ${item.catalogMatch.title}` : item.name}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
