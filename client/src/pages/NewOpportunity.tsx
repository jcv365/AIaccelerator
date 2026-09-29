import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

export default function NewOpportunity() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [businessProblem, setBusinessProblem] = useState("");
  const [owner, setOwner] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch("/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, businessProblem, owner }),
    });
    if (res.ok) {
      const created = await res.json();
      navigate(`/opportunities/${created.id}`);
    }
  }

  return (
    <main>
      <h1>New Opportunity</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Business problem
          <textarea value={businessProblem} onChange={(e) => setBusinessProblem(e.target.value)} />
        </label>
        <label>
          Owner
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
