import "./ui.css";

export interface AiAssessmentNoteProps {
  model: string;
  /** ISO date string of when the assessment ran. */
  createdAt: string;
  /** The AI's stated basis. Rendered as plain text, in a disclosure so it never crowds the screen. */
  rationale?: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Attribution for any AI-produced number: who produced it, when, and on what basis. Never omitted next to an AI figure. */
export function AiAssessmentNote({ model, createdAt, rationale }: AiAssessmentNoteProps) {
  const when = formatDate(createdAt);
  return (
    <div className="ai-note">
      <p className="ai-note__line">
        AI assessment · {model}
        {when ? ` · ${when}` : ""}
      </p>
      {rationale && (
        <details className="ai-note__details">
          <summary>Why</summary>
          <p>{rationale}</p>
        </details>
      )}
    </div>
  );
}
