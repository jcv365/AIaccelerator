import "./ui.css";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** "Showing 1–10 of 32" with Previous / Next. Renders nothing when everything fits on one page. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const current = Math.min(Math.max(1, page), pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination__summary">
        Showing {from}–{to} of {total}
      </span>
      <span className="pagination__controls">
        <button type="button" className="btn" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          Previous
        </button>
        <span className="pagination__page" aria-current="page">
          Page {current} of {pages}
        </span>
        <button type="button" className="btn" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
          Next
        </button>
      </span>
    </nav>
  );
}
