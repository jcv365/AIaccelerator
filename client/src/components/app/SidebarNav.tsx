import { NavLink } from "react-router-dom";
import "./app.css";

interface NavItem {
  label: string;
  to?: string;
  icon: React.ReactNode;
}

const icon = {
  dashboard: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1.5" y="1.5" width="6" height="6" rx="1" />
      <rect x="8.5" y="1.5" width="6" height="9" rx="1" />
      <rect x="1.5" y="9.5" width="6" height="5" rx="1" />
    </svg>
  ),
  portfolio: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 6h13" />
    </svg>
  ),
  evidence: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3.5 3.5" />
    </svg>
  ),
  hypothesis: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 1.5h4M8 1.5v3.2a3.5 3.5 0 0 0 .7 2.1l1.6 2.2a3 3 0 0 1 .6 1.8v1.7a1 1 0 0 1-1 1H6.1a1 1 0 0 1-1-1V10.8a3 3 0 0 1 .6-1.8l1.6-2.2A3.5 3.5 0 0 0 8 4.7" />
    </svg>
  ),
  pov: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  ),
  noAi: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 5.5l5 5" />
    </svg>
  ),
  health: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M1.5 8h3l2-4.5 3 9 2-4.5h3" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 2h7l3 3v9H3z" />
      <path d="M6 8.5h4M6 11h4" />
    </svg>
  ),
  competitive: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="2.3" />
      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </svg>
  ),
};

// Only Dashboard and Portfolio have a real route so far (APP-DASH/APP-01 are
// the next build steps). The rest are the approved IA's destinations but
// aren't built yet — rendered as disabled items, not links to a route that
// would 404, per the same "visibly not yet available" pattern used for SSO.
const items: NavItem[] = [
  { label: "New analysis", to: "/app/wizard", icon: icon.pov },
  { label: "Dashboard", to: "/app", icon: icon.dashboard },
  { label: "Companies", to: "/app/companies", icon: icon.portfolio },
  { label: "Opportunity Portfolio", to: "/app/portfolio", icon: icon.portfolio },
  { label: "Evidence Explorer", to: "/app/evidence", icon: icon.evidence },
  { label: "Hypothesis Engine", to: "/app/hypothesis", icon: icon.hypothesis },
  { label: "14-Day PoV Pipeline", to: "/app/pov", icon: icon.pov },
  { label: "No-AI Opportunities", to: "/app/no-ai", icon: icon.noAi },
  // Shown as in the mockup but disabled: no screens exist behind these two yet.
  { label: "Competitive Intelligence", icon: icon.competitive },
  { label: "Reports & Exports", to: "/app/reports", icon: icon.reports },
  { label: "Settings", icon: icon.settings },
  { label: "System Health", to: "/admin/health", icon: icon.health },
];

export interface SidebarNavProps {
  /** Called after a link is followed, so the phone drawer can close itself. */
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  return (
    <nav className="sidebar-nav" aria-label="Primary">
      {items.map((item) =>
        item.to ? (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === "/app"}
            onClick={onNavigate}
            className={({ isActive }) => `sidebar-nav__link${isActive ? " active" : ""}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ) : (
          <span key={item.label} className="sidebar-nav__link sidebar-nav__link--disabled" aria-disabled="true">
            {item.icon}
            <span className="sidebar-nav__text">
              {item.label}
              <span className="sidebar-nav__soon">Coming soon</span>
            </span>
          </span>
        ),
      )}
    </nav>
  );
}
