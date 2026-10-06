import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useCompany } from "../company/CompanyContext";
import { Button, InlineAlert, TextAreaField, TextField } from "../components/ui";
import "./NewOpportunity.css";

export default function NewOpportunity() {
  const navigate = useNavigate();
  const { scoped, currentId, current } = useCompany();
  const needsCompany = scoped && !currentId;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [businessProblem, setBusinessProblem] = useState("");
  const [owner, setOwner] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, businessProblem, owner, ...(scoped && currentId ? { companyId: currentId } : {}) }),
      });
      if (res.ok) {
        const created = await res.json();
        navigate(`/app/opportunities/${created.id}`);
        return;
      }
      setError("Could not save this opportunity. Check the fields and try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>New Opportunity</h1>
      <form className="new-opportunity__form" onSubmit={handleSubmit}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextAreaField
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextAreaField
          label="Business problem"
          rows={3}
          value={businessProblem}
          onChange={(e) => setBusinessProblem(e.target.value)}
        />
        <TextField label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
        {current && <p className="new-opportunity__company">Will be filed under {current.name}.</p>}
        {needsCompany && (
          <InlineAlert variant="info">Add a company first (top bar) so this opportunity can be filed under it.</InlineAlert>
        )}
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        <Button type="submit" variant="primary" disabled={loading || needsCompany}>
          {loading ? "Creating…" : "Create"}
        </Button>
      </form>
    </main>
  );
}
