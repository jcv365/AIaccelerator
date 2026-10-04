import { useState } from "react";
import { Button, InlineAlert } from "../../ui";
import type { Evidence } from "./types";

export interface EvidenceTabProps {
  evidence: Evidence[];
  onAddEvidence: (claim: string, type: string) => Promise<void>;
}

export function EvidenceTab({ evidence, onAddEvidence }: EvidenceTabProps) {
  const [claim, setClaim] = useState("");
  const [type, setType] = useState("FACT");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onAddEvidence(claim, type);
      setClaim("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add evidence.");
    }
  }

  return (
    <section>
      <h2>Evidence</h2>
      {evidence.length === 0 ? (
        <p>No evidence recorded yet.</p>
      ) : (
        <ul>
          {evidence.map((ev) => (
            <li key={ev.id}>
              <span className="evidence-tag">[{ev.type}]</span> {ev.claim}
            </li>
          ))}
        </ul>
      )}
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <form onSubmit={handleSubmit}>
        <input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Claim" required />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="FACT">FACT</option>
          <option value="INFERENCE">INFERENCE</option>
          <option value="ASSUMPTION">ASSUMPTION</option>
          <option value="AI_HYPOTHESIS">AI_HYPOTHESIS</option>
        </select>
        <Button type="submit" variant="primary">
          Add
        </Button>
      </form>
    </section>
  );
}
