import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, DataTable, InlineAlert, StatusBadge } from "../../ui";
import type { Experiment } from "./types";

export interface ExperimentsTabProps {
  opportunityId: string;
  experiments: Experiment[];
  onAddExperiment: (title: string, method: string) => Promise<void>;
}

export function ExperimentsTab({ opportunityId, experiments, onAddExperiment }: ExperimentsTabProps) {
  const [title, setTitle] = useState("");
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onAddExperiment(title, method);
      setTitle("");
      setMethod("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add experiment.");
    }
  }

  return (
    <section>
      <h2>Experiments</h2>
      <DataTable
        rows={experiments}
        getRowKey={(row) => row.id}
        emptyMessage="No experiments yet."
        columns={[
          {
            key: "title",
            header: "Experiment",
            render: (row) => <Link to={`/app/opportunities/${opportunityId}/experiments/${row.id}`}>{row.title}</Link>,
          },
          { key: "method", header: "Method", render: (row) => row.method },
          { key: "status", header: "Status", render: (row) => <StatusBadge label={row.status} tone="accent" /> },
        ]}
      />
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <form onSubmit={handleSubmit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
        <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Method" required />
        <Button type="submit" variant="primary">
          Add Experiment
        </Button>
      </form>
    </section>
  );
}
