import { AlertTriangle, DatabaseBackup, Download, FileJson, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { PageHeader } from "../components/Common";
import { downloadFile, makeCsv } from "../lib";
import { useTracker } from "../store";
import type { TrackerState } from "../types";

export function Backup() {
  const { state, seed, importState, resetState, storageError } = useTracker();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [resetArmed, setResetArmed] = useState(false);

  const date = new Date().toISOString().slice(0, 10);
  const exportJson = () => downloadFile(`maxines-pop-tracker-${date}.json`, JSON.stringify(state, null, 2), "application/json");
  const exportCsv = () => downloadFile(`maxines-pop-tracker-${date}.csv`, makeCsv(state.items, state.settings.currency), "text/csv;charset=utf-8");
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as TrackerState;
      importState(parsed);
      setMessage(`Imported ${parsed.items.length.toLocaleString()} records from ${file.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="backup-page">
      <PageHeader eyebrow="KEEP IT SAFE" title="Data & backup" description="The tracker saves automatically in this browser. Export a backup before changing computer, browser profile, or clearing site data." />
      {storageError && <div className="inline-alert warning page-alert"><AlertTriangle /><p>Automatic save failed: {storageError}</p></div>}
      {message && <div className="inline-alert success page-alert"><DatabaseBackup /><p>{message}</p></div>}
      <div className="backup-grid">
        <section className="panel backup-primary">
          <div className="panel-heading"><div><span className="eyebrow red">RECOMMENDED</span><h2>Portable JSON backup</h2></div><FileJson /></div>
          <p>Keeps every edit, value, image choice, note, and setting. Use this file to move Maxine’s tracker to another PC.</p>
          <button className="button primary" onClick={exportJson}><Download size={17} /> Export full backup</button>
          <div className="divider"><span>RESTORE</span></div>
          <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(event) => importBackup(event.target.files?.[0])} />
          <button className="button secondary" onClick={() => inputRef.current?.click()}><Upload size={17} /> Import a backup</button>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow red">SPREADSHEET</span><h2>CSV export</h2></div><FileSpreadsheet /></div>
          <p>Exports a readable flat list for Excel or Google Sheets. CSV is useful for sharing, but it is not a complete restorable backup.</p>
          <button className="button secondary" onClick={exportCsv}><Download size={17} /> Export CSV</button>
        </section>
        <section className="panel source-card">
          <span className="eyebrow red">SOURCE SNAPSHOT</span><h2>What was imported</h2>
          <dl>
            <div><dt>Workbook</dt><dd>{seed.meta.workbook}</dd></div>
            <div><dt>Sheets used</dt><dd>{seed.meta.includedSheets.join(", ")}</dd></div>
            <div><dt>Rows at first import</dt><dd>{seed.items.length.toLocaleString()}</dd></div>
            <div><dt>Open catalog</dt><dd>{seed.meta.catalogProject}</dd></div>
            <div><dt>Catalog snapshot</dt><dd>{seed.meta.catalogLastUpdated}</dd></div>
          </dl>
          <p className="fine-print">Movie order for shelves, Sheet5, and archival/working sheets were intentionally ignored.</p>
        </section>
        <section className="panel danger-zone">
          <div className="panel-heading"><div><span className="eyebrow">DANGER ZONE</span><h2>Start over</h2></div><RotateCcw /></div>
          <p>Replace all local edits with the original workbook import. Export a JSON backup first.</p>
          {resetArmed ? <div className="reset-confirm"><button className="button danger" onClick={() => { resetState(); setResetArmed(false); setMessage("Original workbook data restored."); }}>Reset all local data</button><button className="button ghost" onClick={() => setResetArmed(false)}>Cancel</button></div> : <button className="button ghost danger-text" onClick={() => setResetArmed(true)}><RotateCcw size={16} /> Reset to original import</button>}
        </section>
      </div>
    </div>
  );
}
