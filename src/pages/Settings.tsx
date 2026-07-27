import { ExternalLink, Image, SearchCheck, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/Common";
import { useTracker } from "../store";

export function Settings() {
  const { state, setCurrency, setImageProxy } = useTracker();

  return (
    <div className="settings-page">
      <PageHeader eyebrow="MAKE IT YOURS" title="Settings" description="Choose Maxine’s display preferences and review how the Pop Info Finder uses public sources." />
      <div className="settings-grid">
        <section className="panel preferences-panel">
          <div className="panel-heading"><div><span className="eyebrow red">DISPLAY</span><h2>Tracker preferences</h2></div><Image /></div>
          <label className="setting-row"><div><strong>Working currency</strong><p>Labels Maxine’s manually recorded amounts; changing this does not convert existing values.</p></div><select value={state.settings.currency} onChange={(event) => setCurrency(event.target.value as typeof state.settings.currency)}><option>NZD</option><option>AUD</option><option>USD</option><option>GBP</option></select></label>
          <label className="setting-row"><div><strong>Catalog image helper</strong><p>Uses wsrv.nl to display old hobbyDB catalog image links that no longer hotlink directly.</p></div><input type="checkbox" role="switch" checked={state.settings.imageProxy} onChange={(event) => setImageProxy(event.target.checked)} /></label>
        </section>

        <section className="panel security-panel">
          <div className="panel-heading"><div><span className="eyebrow red">NO KEYS REQUIRED</span><h2>Public, on-demand research</h2></div><ShieldCheck /></div>
          <p>The Pop Info Finder runs only when you click it. It does not need Maxine’s eBay or Trade Me login, and it does not store marketplace credentials.</p>
          <ul className="check-list"><li><ShieldCheck /> Price references retain their original currency.</li><li><ShieldCheck /> Every applied match keeps its source URL and check date.</li><li><ShieldCheck /> Low-confidence variants require a manual confirmation.</li></ul>
        </section>

        <section className="panel connection-card pricecharting-card">
          <div className="connection-top"><div className="market-logo price-logo">PriceCharting</div><span className="status-pill public">Primary guide</span></div>
          <h2>Identity, barcode & prices</h2>
          <p>Provides canonical titles, box numbers, UPCs, release dates, large images, and separate out-of-box, damaged-box, and new/sealed reference prices when an exact match exists.</p>
          <a className="button secondary" href="https://www.pricecharting.com/category/funko-pops" target="_blank" rel="noreferrer">Open Funko price guide <ExternalLink size={15} /></a>
        </section>

        <section className="panel connection-card funko-source-card">
          <div className="connection-top"><div className="market-logo">Funko</div><span className="status-pill public">Official identity</span></div>
          <h2>SKU follow-up</h2>
          <p>When a Funko item ID—or a modern 889698 barcode—becomes available, the finder performs an exact official search for the product title, image, and item page.</p>
          <a className="button secondary" href="https://funko.com/search/" target="_blank" rel="noreferrer">Open Funko search <ExternalLink size={15} /></a>
        </section>

        <section className="panel connection-card public-market-card">
          <div className="connection-top"><div className="market-logo"><SearchCheck /> Markets</div><span className="status-pill public">Manual check</span></div>
          <h2>eBay sold & Trade Me</h2>
          <p>The finder builds increasingly specific public searches from the title, box number, SKU, and UPC. Open those results to compare the exact sticker, box condition, shipping, and local asking price.</p>
        </section>
      </div>
    </div>
  );
}
