import "./ui.css";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Up to five page numbers centred on the current page, e.g. 2 3 [4] 5 6. */
function windowAround(current: number, pages: number): number[] {
  const size = Math.min(5, pages);
  const start = Math.min(Math.max(1, current - Math.floor(size / 2)), pages - size + 1);
  return Array.from({ length: size }, (_, i) => start + i);
}

/** "Showing 1–10 of 32" with numbered pages and Previous / Next. Renders nothing when everything fits on one page. */
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
        {windowAround(current, pages).map((n) => (
          <button
            key={n}
            type="button"
            className={`btn pagination__num${n === current ? " pagination__num--current" : ""}`}
            aria-label={`Page ${n}`}
            aria-current={n === current ? "page" : undefined}
            onClick={() => onPageChange(n)}
          >
            {n}
          </button>
        ))}
        <button type="button" className="btn" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
          Next
        </button>
      </span>
    </nav>
  );
}
