import type { ReactNode } from "react";
import "./ui.css";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
}

export function DataTable<Row>({ columns, rows, getRowKey, loading, error, emptyMessage = "No results yet." }: DataTableProps<Row>) {
  if (error) {
    return <p className="data-table__error">{error}</p>;
  }
  if (loading) {
    return <p className="data-table__empty">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="data-table__empty">{emptyMessage}</p>;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getRowKey(row)}>
            {columns.map((column) => (
              <td key={column.key}>{column.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
