import type { ReactNode } from "react";
import "./ui.css";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Page title, an optional one-line description, and optional actions on the right. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
