import "./ui.css";

export interface EvidenceTagProps {
  type: string;
}

/** Evidence type as bracketed text, e.g. [FACT]; colour only reinforces the text, never replaces it. */
export function EvidenceTag({ type }: EvidenceTagProps) {
  return <span className={`evidence-tag evidence-tag--${type.toLowerCase()}`}>[{type}]</span>;
}
