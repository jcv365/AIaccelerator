import { useState } from "react";
import { Button } from "./Button";
import "./ui.css";

export interface ReportPanelProps {
  title: string;
  text: string;
  /** Short line under the title, e.g. where the report came from. */
  meta?: string;
}

/** A generated report in a readable card: title, optional meta line, a Copy text action, and paragraph-split body. */
export function ReportPanel({ title, text, meta }: ReportPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim() !== "");

  return (
    <article className="report-panel">
      <header className="report-panel__head">
        <div>
          <strong>{title}</strong>
          {meta && <div className="report-panel__meta">{meta}</div>}
        </div>
        <Button onClick={copy}>{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy text"}</Button>
      </header>
      <div className="report-panel__body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </article>
  );
}
