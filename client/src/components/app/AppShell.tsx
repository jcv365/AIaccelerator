import { useState, type ReactNode } from "react";
import { SidebarNav } from "./SidebarNav";
import { CompanySwitcher } from "./CompanySwitcher";
import { StatusIndicator } from "./StatusIndicator";
import { PRODUCT_NAME } from "../../brand";
import "./app.css";

export interface AppShellProps {
  onLogout: () => void;
  children: ReactNode;
}

// Placeholder company list — no multi-tenant data model exists yet (SCREENS.md
// §D, APP-00). Real company scoping is a schema change this skill doesn't build.
const PLACEHOLDER_COMPANIES = ["ABC Manufacturing"];

export function AppShell({ onLogout, children }: AppShellProps) {
  const [company, setCompany] = useState(PLACEHOLDER_COMPANIES[0]);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell" data-surface="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__mark" aria-hidden="true" />
          {PRODUCT_NAME}
        </div>
        {/* Visible only at <= 800px, where the sidebar collapses into a top bar with this toggle. */}
        <button
          type="button"
          className="app-sidebar__menu-btn"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar-panel"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
        <div id="app-sidebar-panel" className={`app-sidebar__panel${menuOpen ? " app-sidebar__panel--open" : ""}`}>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
          <div className="app-sidebar__footer">
            <StatusIndicator onLogout={onLogout} />
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <CompanySwitcher companies={PLACEHOLDER_COMPANIES} current={company} onChange={setCompany} />
        </header>
        <main id="main-content" className="app-shell__content">
          {children}
        </main>
      </div>
    </div>
  );
}
