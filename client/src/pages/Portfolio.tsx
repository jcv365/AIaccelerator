import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

const STATUS_ORDER = [
  "DISCOVERED",
  "QUALIFIED",
  "HYPOTHESIS",
  "EXPERIMENT",
  "PROVING",
  "PROVEN",
  "REJECTED",
  "DEFERRED",
  "NO_AI",
] as const;

interface OpportunitySummary {
  id: string;
  title: string;
  status: string;
  owner: string | null;
}

export default function Portfolio() {
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);

  useEffect(() => {
    apiFetch("/opportunities")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then(setOpportunities)
      .catch(() => setOpportunities([]));
  }, []);

  return (
    <main>
      <h1>AI Accelerator</h1>
      <Link to="/opportunities/new">+ New</Link>
      {STATUS_ORDER.map((status) => {
        const group = opportunities.filter((o) => o.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status}>
            <h2>{status}</h2>
            <ul>
              {group.map((o) => (
                <li key={o.id}>
                  <Link to={`/opportunities/${o.id}`}>{o.title}</Link> — {o.owner ?? "—"}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
