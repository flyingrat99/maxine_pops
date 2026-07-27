import {
  Archive,
  BarChart3,
  Boxes,
  Heart,
  Menu,
  SearchCheck,
  Sparkles,
  Settings,
  Store,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PageId } from "../types";

const navItems: { id: PageId; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "collection", label: "Collection", icon: Boxes },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "sale", label: "For sale", icon: Store },
  { id: "gaps", label: "Gap finder", icon: SearchCheck },
  { id: "finder", label: "Pop info finder", icon: Sparkles },
  { id: "backup", label: "Data & backup", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings },
];

interface LayoutProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  counts: Partial<Record<PageId, number>>;
  children: ReactNode;
}

export function Layout({ page, onNavigate, counts, children }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (target: PageId) => {
    onNavigate(target);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle navigation">
          {menuOpen ? <X /> : <Menu />}
        </button>
        <button className="mobile-brand" onClick={() => navigate("dashboard")}>MAXINE’S <span>POP TRACKER</span></button>
      </header>
      {menuOpen && <button className="menu-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <button className="brand" onClick={() => navigate("dashboard")}>
          <span className="brand-kicker">MAXINE’S</span>
          <span className="brand-main">POP</span>
          <span className="brand-foot">TRACKER</span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={page === item.id ? "nav-item active" : "nav-item"}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? "page" : undefined}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {counts[item.id] !== undefined && <span className="nav-count">{counts[item.id]?.toLocaleString()}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">LOCAL-FIRST</span>
          <p>Your edits stay on this computer until you export a backup.</p>
        </div>
        <div className="unofficial">Unofficial fan-made collection tool</div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
