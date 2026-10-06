import "./ui.css";

export interface BarListItem {
  label: string;
  value: number;
  /** Text shown at the end of the row; defaults to the number. */
  display?: string;
}

export interface BarListProps {
  items: BarListItem[];
  /** The value that fills a bar completely; defaults to the largest value in the list. */
  max?: number;
  caption: string;
}

/** Labelled horizontal bars ("High value  ▮▮▮▮  8"). A real list, so the numbers are always readable as text. */
export function BarList({ items, max, caption }: BarListProps) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="bar-list" aria-label={caption}>
      {items.map((item) => (
        <li key={item.label} className="bar-list__row">
          <span className="bar-list__label">{item.label}</span>
          <span className="bar-list__track" aria-hidden="true">
            <span className="bar-list__fill" style={{ width: `${Math.min(100, (item.value / top) * 100)}%` }} />
          </span>
          <span className="bar-list__value">{item.display ?? item.value}</span>
        </li>
      ))}
    </ul>
  );
}
