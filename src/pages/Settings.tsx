import { CheckCircle2, ExternalLink, Eye, EyeOff, Image, KeyRound, Link2, LoaderCircle, LockKeyhole, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../components/Common";
import { useTracker } from "../store";
import type { ConnectionStatus } from "../types";

const emptyStatus: ConnectionStatus = {
  ebay: { configured: false, marketplace: "EBAY_AU", label: "Not configured" },
  trademe: { configured: false, connected: false, environment: "production", label: "Not configured" },
};

export function Settings() {
  const { state, setCurrency, setImageProxy } = useTracker();
  const [status, setStatus] = useState<ConnectionStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/connections");
      const payload = await response.json() as ConnectionStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not read connection status.");
      setStatus(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The local connection service is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const saveConnection = async (source: "ebay" | "trademe", event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setError("");
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(`/api/connections/${source}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save credentials.");
      setMessage(payload.message || `${source} credentials saved locally.`);
      form.reset();
      await refreshStatus();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save credentials.");
    }
  };

  const testConnection = async (source: "ebay" | "trademe") => {
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/connections/${source}/test`, { method: "POST" });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Connection test failed.");
      setMessage(payload.message || "Connection test passed.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Connection test failed.");
    }
  };

  const connectTradeMe = async () => {
    setError("");
    try {
      const response = await fetch("/api/connections/trademe/start", { method: "POST" });
      const payload = await response.json() as { authorizeUrl?: string; error?: string };
      if (!response.ok || !payload.authorizeUrl) throw new Error(payload.error || "Could not begin Trade Me authorization.");
      window.location.href = payload.authorizeUrl;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not begin Trade Me authorization.");
    }
  };

  const disconnectTradeMe = async () => {
    await fetch("/api/connections/trademe/token", { method: "DELETE" });
    setMessage("The local Trade Me member token was removed. You can also revoke the app in My Trade Me.");
    await refreshStatus();
  };

  const clearConnection = async (source: "ebay" | "trademe") => {
    const confirmed = window.confirm(`Remove the saved ${source === "ebay" ? "eBay" : "Trade Me"} API credentials from this computer?`);
    if (!confirmed) return;
    const response = await fetch(`/api/connections/${source}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string; message?: string };
    if (!response.ok) {
      setError(payload.error || "Could not remove the saved credentials.");
      return;
    }
    setMessage(payload.message || "Saved credentials removed.");
    await refreshStatus();
  };

  return (
    <div className="settings-page">
      <PageHeader eyebrow="MAKE IT YOURS" title="Settings & connections" description="Choose Maxine’s display preferences and optionally connect approved marketplace API apps for in-tracker price searches." />
      {message && <div className="inline-alert success page-alert"><CheckCircle2 /><p>{message}</p></div>}
      {error && <div className="inline-alert warning page-alert"><LockKeyhole /><p>{error}</p></div>}
      <div className="settings-grid">
        <section className="panel preferences-panel">
          <div className="panel-heading"><div><span className="eyebrow red">DISPLAY</span><h2>Tracker preferences</h2></div><Image /></div>
          <label className="setting-row"><div><strong>Working currency</strong><p>Labels recorded amounts; changing this does not convert existing values.</p></div><select value={state.settings.currency} onChange={(event) => setCurrency(event.target.value as typeof state.settings.currency)}><option>NZD</option><option>AUD</option><option>USD</option><option>GBP</option></select></label>
          <label className="setting-row"><div><strong>Catalog image helper</strong><p>Uses wsrv.nl to display old hobbyDB catalog image links that no longer hotlink directly.</p></div><input type="checkbox" role="switch" checked={state.settings.imageProxy} onChange={(event) => setImageProxy(event.target.checked)} /></label>
        </section>

        <section className="panel security-panel">
          <div className="panel-heading"><div><span className="eyebrow red">LOCAL CREDENTIAL FILE</span><h2>How credentials are handled</h2></div><LockKeyhole /></div>
          <p>Secrets are sent only to the local Node server and stored in <code>data/local-connections.json</code>, which Git ignores. This file is not encrypted, so protect the Windows account and app folder. The browser receives connection status, never saved secrets.</p>
          <ul className="check-list"><li><CheckCircle2 /> No Trade Me or eBay password is requested.</li><li><CheckCircle2 /> Marketplace account approval happens on the marketplace’s own website.</li><li><CheckCircle2 /> The server listens only on this PC at 127.0.0.1.</li></ul>
          <button className="text-button" onClick={() => setShowSecrets((value) => !value)}>{showSecrets ? <EyeOff size={15} /> : <Eye size={15} />} {showSecrets ? "Hide credential fields" : "Show credential fields"}</button>
        </section>

        <section className="panel connection-card ebay-card">
          <div className="connection-top"><div className="market-logo ebay-logo">eBay</div><span className={`status-pill ${status.ebay.configured ? "connected" : ""}`}>{loading ? <LoaderCircle className="spin" size={13} /> : status.ebay.label}</span></div>
          <h2>Active eBay listings</h2>
          <p>The free Browse API can search current asking prices. It uses app-only OAuth 2 credentials; it does not log in to Maxine’s eBay account or provide unrestricted sold history.</p>
          {showSecrets && (
            <form className="credentials-form" onSubmit={(event) => saveConnection("ebay", event)}>
              <label><span>Client ID (App ID)</span><input name="clientId" autoComplete="off" placeholder={status.ebay.configured ? "Leave blank to keep saved value" : "Production App ID"} /></label>
              <label><span>Client secret (Cert ID)</span><input name="clientSecret" type="password" autoComplete="new-password" placeholder={status.ebay.configured ? "Leave blank to keep saved value" : "Production Cert ID"} /></label>
              <label><span>Marketplace</span><select name="marketplace" defaultValue={status.ebay.marketplace}><option value="EBAY_AU">eBay Australia (AUD)</option><option value="EBAY_US">eBay United States (USD)</option><option value="EBAY_GB">eBay United Kingdom (GBP)</option></select></label>
              <button className="button primary" type="submit"><KeyRound size={16} /> Save locally</button>
            </form>
          )}
          <div className="connection-actions"><button className="button secondary" disabled={!status.ebay.configured} onClick={() => testConnection("ebay")}><RefreshCw size={15} /> Test search</button>{status.ebay.configured && <button className="button ghost danger-text" onClick={() => clearConnection("ebay")}><Unplug size={15} /> Remove app</button>}<a href="https://developer.ebay.com/signin" target="_blank" rel="noreferrer">eBay developer portal <ExternalLink size={13} /></a></div>
        </section>

        <section className="panel connection-card trademe-card">
          <div className="connection-top"><div className="market-logo trademe-logo">Trade Me</div><span className={`status-pill ${status.trademe.connected ? "connected" : status.trademe.configured ? "configured" : ""}`}>{loading ? <LoaderCircle className="spin" size={13} /> : status.trademe.label}</span></div>
          <h2>NZ marketplace search</h2>
          <p>Trade Me uses OAuth 1.0a. An approved app can search NZD listings; member authorization can also read Maxine’s own Trade Me summary without sharing her password.</p>
          <div className="inline-alert warning compact"><LockKeyhole size={17} /><p>Since 10 April 2026, new Marketplace API app registration is limited to in-trade sellers. Existing approved credentials may still work.</p></div>
          {showSecrets && (
            <form className="credentials-form" onSubmit={(event) => saveConnection("trademe", event)}>
              <label><span>Consumer key</span><input name="consumerKey" autoComplete="off" placeholder={status.trademe.configured ? "Leave blank to keep saved value" : "Approved app consumer key"} /></label>
              <label><span>Consumer secret</span><input name="consumerSecret" type="password" autoComplete="new-password" placeholder={status.trademe.configured ? "Leave blank to keep saved value" : "Approved app consumer secret"} /></label>
              <label><span>Environment</span><select name="environment" defaultValue={status.trademe.environment}><option value="production">Production</option><option value="sandbox">Sandbox</option></select></label>
              <button className="button primary" type="submit"><KeyRound size={16} /> Save locally</button>
            </form>
          )}
          <div className="connection-actions stack-mobile">
            <button className="button secondary" disabled={!status.trademe.configured} onClick={() => testConnection("trademe")}><RefreshCw size={15} /> Test search</button>
            {status.trademe.connected ? <button className="button ghost danger-text" onClick={disconnectTradeMe}><Unplug size={15} /> Disconnect member</button> : <button className="button primary" disabled={!status.trademe.configured} onClick={connectTradeMe}><Link2 size={15} /> Connect Trade Me member</button>}
            {status.trademe.configured && <button className="button ghost danger-text" onClick={() => clearConnection("trademe")}><Unplug size={15} /> Remove app</button>}
            <a href="https://developer.trademe.co.nz/api-overview/registering-an-application" target="_blank" rel="noreferrer">Trade Me API rules <ExternalLink size={13} /></a>
          </div>
        </section>

        <section className="panel pricecharting-card">
          <div className="connection-top"><div className="market-logo price-logo">PriceCharting</div><span className="status-pill public">Public links</span></div>
          <h2>Sold-price research</h2>
          <p>PriceCharting added Funko prices in 2024, with daily eBay-backed sales and separate boxed/out-of-box values. Search links work now; direct API access is a paid feature, so the tracker does not scrape it.</p>
          <a className="button secondary" href="https://www.pricecharting.com/category/funko-pops" target="_blank" rel="noreferrer">Open Funko price guide <ExternalLink size={15} /></a>
        </section>
      </div>
    </div>
  );
}
