import type { ReactNode } from "react";
import "./ui.css";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  "aria-label": string;
}

export function Tabs({ items, activeId, onChange, "aria-label": ariaLabel }: TabsProps) {
  return (
    <div className="tabs__list" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === activeId}
          aria-controls={`tabpanel-${item.id}`}
          tabIndex={item.id === activeId ? 0 : -1}
          className="tabs__tab"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  activeId: string;
  children: ReactNode;
}

export function TabPanel({ id, activeId, children }: TabPanelProps) {
  if (id !== activeId) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
