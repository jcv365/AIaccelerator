import { useState } from "react";
import { Button, InlineAlert, TextAreaField } from "../../ui";
import type { Decision } from "./types";

export interface DecisionTabProps {
  decisions: Decision[];
  onAddDecision: (decision: string) => Promise<void>;
}

export function DecisionTab({ decisions, onAddDecision }: DecisionTabProps) {
  const [decisionText, setDecisionText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onAddDecision(decisionText);
      setDecisionText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save decision.");
    }
  }

  return (
    <section>
      <h2>Decision</h2>
      {decisions.length === 0 ? (
        <p>No decision recorded yet.</p>
      ) : (
        <ul>
          {decisions.map((d) => (
            <li key={d.id}>{d.decision}</li>
          ))}
        </ul>
      )}
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <form onSubmit={handleSubmit}>
        <TextAreaField
          label="Decision"
          rows={2}
          value={decisionText}
          onChange={(e) => setDecisionText(e.target.value)}
          required
        />
        <Button type="submit" variant="primary">
          Save Decision
        </Button>
      </form>
    </section>
  );
}
