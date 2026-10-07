import { useState, type ReactNode } from "react";
import { SidebarNav } from "./SidebarNav";
import { CompanySwitcher } from "./CompanySwitcher";
import { RunSwitcher } from "./RunSwitcher";
import { StatusIndicator } from "./StatusIndicator";
import { PRODUCT_NAME } from "../../brand";
import { BrandMark } from "../BrandMark";
import { CompanyProvider, useCompany } from "../../company/CompanyContext";
import { currentUsername, initials } from "../../lib/identity";
import "./app.css";

export interface AppShellProps {
  onLogout: () => void;
  children: ReactNode;
}

/** The top-bar picker wired to the real company list (see company/CompanyContext). */
function ConnectedCompanySwitcher() {
  const { companies, currentId, select, createCompany } = useCompany();
  return (
    <CompanySwitcher
      companies={companies}
      currentId={currentId}
      onSelect={select}
      onCreate={async (name, website) => {
        const { created, company } = await createCompany({ name, website });
        return { created, name: company.name };
      }}
    />
  );
}

/** The top-bar analysis-run picker: screens show only what the chosen run found. */
function ConnectedRunSwitcher() {
  const { runs, runId, selectRun } = useCompany();
  return <RunSwitcher runs={runs} runId={runId} onSelect={selectRun} />;
}

/** Today's date and the signed-in user's initials, top right. */
function TopbarIdentity({ username }: { username: string | null }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="app-topbar__identity">
      <time className="app-topbar__date" dateTime={new Date().toISOString().slice(0, 10)}>
        {today}
      </time>
      <span className="app-avatar" role="img" aria-label={username ? `Signed in as ${username}` : "Signed in"}>
        {initials(username ?? "?")}
      </span>
    </div>
  );
}

export function AppShell({ onLogout, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const username = currentUsername();

  return (
    <CompanyProvider>
    <div className="app-shell" data-surface="app" data-theme="light">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <BrandMark />
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
            <div className="app-user">
              <span className="app-avatar" aria-hidden="true">
                {initials(username ?? "?")}
              </span>
              <span className="app-user__text">
                <span className="app-user__name">{username ?? "Signed in"}</span>
                <span className="app-user__role">Administrator</span>
              </span>
            </div>
            <StatusIndicator onLogout={onLogout} />
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <ConnectedCompanySwitcher />
          <ConnectedRunSwitcher />
          <TopbarIdentity username={username} />
        </header>
        <main id="main-content" className="app-shell__content">
          {children}
        </main>
      </div>
    </div>
    </CompanyProvider>
  );
}
