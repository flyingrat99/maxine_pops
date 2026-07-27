import { useMemo, useState } from "react";
import { Layout } from "./components/Layout";
import { ItemModal } from "./components/ItemModal";
import { useTracker } from "./store";
import { Backup } from "./pages/Backup";
import { Dashboard } from "./pages/Dashboard";
import { Gaps } from "./pages/Gaps";
import { Library } from "./pages/Library";
import { Settings } from "./pages/Settings";
import type { ItemStatus, PageId, PopItem } from "./types";

interface ModalState {
  item: PopItem | null;
  status: ItemStatus;
}

export default function App() {
  const { state, addItem, updateItem, deleteItem } = useTracker();
  const [page, setPage] = useState<PageId>(() => window.location.hash.includes("settings") ? "settings" : "dashboard");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState("");

  const counts = useMemo(() => ({
    collection: state.items.filter((item) => item.status === "owned").length,
    wishlist: state.items.filter((item) => item.status === "wishlist").length,
    sale: state.items.filter((item) => item.status === "sale").length,
  }), [state.items]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const openNew = (status: ItemStatus) => setModal({ item: null, status });
  const openEdit = (item: PopItem) => setModal({ item, status: item.status });
  const openEditById = (id: string) => {
    const item = state.items.find((entry) => entry.id === id);
    if (item) openEdit(item);
  };
  const save = (item: PopItem, isNew: boolean) => {
    if (isNew) addItem(item);
    else updateItem(item);
    setModal(null);
    notify(isNew ? `${item.name} added.` : `${item.name} saved.`);
  };
  const remove = (item: PopItem) => {
    deleteItem(item.id);
    setModal(null);
    notify(`${item.name} removed from the local tracker.`);
  };

  let content;
  if (page === "dashboard") content = <Dashboard onNavigate={setPage} onAdd={openNew} onEdit={openEditById} />;
  else if (page === "collection") content = <Library status="owned" onAdd={() => openNew("owned")} onEdit={openEdit} />;
  else if (page === "wishlist") content = <Library status="wishlist" onAdd={() => openNew("wishlist")} onEdit={openEdit} />;
  else if (page === "sale") content = <Library status="sale" onAdd={() => openNew("sale")} onEdit={openEdit} />;
  else if (page === "gaps") content = <Gaps />;
  else if (page === "backup") content = <Backup />;
  else content = <Settings />;

  return (
    <>
      <Layout page={page} onNavigate={setPage} counts={counts}>{content}</Layout>
      {modal && (
        <ItemModal
          item={modal.item}
          initialStatus={modal.status}
          currency={state.settings.currency}
          useProxy={state.settings.imageProxy}
          onClose={() => setModal(null)}
          onSave={save}
          onDelete={remove}
          onOpenSettings={() => { setModal(null); setPage("settings"); }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
