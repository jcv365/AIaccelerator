import "./ui.css";

export interface AvatarsProps {
  names: string[];
  /** How many circles to show before collapsing the rest into "+N". */
  max?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Initials circles for a team. The full names are in the accessible label, so nothing depends on reading the letters. */
export function Avatars({ names, max = 3 }: AvatarsProps) {
  if (names.length === 0) return <span className="priority-unset">No team assigned</span>;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="avatars" role="img" aria-label={`Team: ${names.join(", ")}`}>
      {shown.map((name, i) => (
        <span key={`${name}-${i}`} className="avatars__item" aria-hidden="true">
          {initials(name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="avatars__item avatars__item--more" aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}
