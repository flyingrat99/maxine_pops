import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import seedJson from "./data/seed.json";
import type { PopItem, SeedData, TrackerState } from "./types";

const STORAGE_KEY = "maxines-pop-tracker:v1";
const seed = seedJson as SeedData;

function normalizeItem(item: PopItem): PopItem {
  return {
    ...item,
    sku: String(item.sku ?? ""),
    upc: String(item.upc ?? "").replace(/\D/g, ""),
    description: String(item.description ?? ""),
    releaseDate: String(item.releaseDate ?? ""),
    referencePrices: item.referencePrices ?? null,
    infoSources: Array.isArray(item.infoSources) ? item.infoSources : [],
    infoCheckedAt: String(item.infoCheckedAt ?? ""),
  };
}

function freshState(): TrackerState {
  return {
    schemaVersion: 3,
    items: structuredClone(seed.items).map(normalizeItem),
    settings: { currency: "NZD", imageProxy: true },
    lastSavedAt: new Date().toISOString(),
  };
}

function loadState(): TrackerState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return freshState();
    const parsed = JSON.parse(saved) as Partial<TrackerState>;
    if (!Array.isArray(parsed.items)) return freshState();
    return {
      schemaVersion: 3,
      items: parsed.items.map(normalizeItem),
      settings: {
        currency: parsed.settings?.currency ?? "NZD",
        imageProxy: parsed.settings?.imageProxy ?? true,
      },
      lastSavedAt: parsed.lastSavedAt ?? new Date().toISOString(),
    };
  } catch {
    return freshState();
  }
}

interface TrackerContextValue {
  state: TrackerState;
  seed: SeedData;
  storageError: string;
  updateItem: (item: PopItem) => void;
  addItem: (item: PopItem) => void;
  deleteItem: (id: string) => void;
  importState: (state: TrackerState) => void;
  resetState: () => void;
  setCurrency: (currency: TrackerState["settings"]["currency"]) => void;
  setImageProxy: (enabled: boolean) => void;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrackerState>(loadState);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: new Date().toISOString() }));
      setStorageError("");
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Browser storage is unavailable.");
    }
  }, [state]);

  const updateItem = useCallback((item: PopItem) => {
    setState((current) => ({ ...current, items: current.items.map((entry) => entry.id === item.id ? item : entry) }));
  }, []);

  const addItem = useCallback((item: PopItem) => {
    setState((current) => ({ ...current, items: [item, ...current.items] }));
  }, []);

  const deleteItem = useCallback((id: string) => {
    setState((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== id) }));
  }, []);

  const importState = useCallback((imported: TrackerState) => {
    if (!Array.isArray(imported.items)) throw new Error("This backup does not contain an items list.");
    setState({
      schemaVersion: 3,
      items: imported.items.map(normalizeItem),
      settings: imported.settings ?? { currency: "NZD", imageProxy: true },
      lastSavedAt: new Date().toISOString(),
    });
  }, []);

  const resetState = useCallback(() => setState(freshState()), []);
  const setCurrency = useCallback((currency: TrackerState["settings"]["currency"]) => {
    setState((current) => ({ ...current, settings: { ...current.settings, currency } }));
  }, []);
  const setImageProxy = useCallback((imageProxy: boolean) => {
    setState((current) => ({ ...current, settings: { ...current.settings, imageProxy } }));
  }, []);

  const value = useMemo(() => ({
    state, seed, storageError, updateItem, addItem, deleteItem, importState, resetState, setCurrency, setImageProxy,
  }), [state, storageError, updateItem, addItem, deleteItem, importState, resetState, setCurrency, setImageProxy]);

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const context = useContext(TrackerContext);
  if (!context) throw new Error("useTracker must be used inside TrackerProvider");
  return context;
}
