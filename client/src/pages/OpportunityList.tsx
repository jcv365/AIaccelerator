import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

interface OpportunitySummary {
  id: string;
  title: string;
  status: string;
  owner: string | null;
}

export default function OpportunityList() {
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
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id}>
              <td>
                <Link to={`/opportunities/${o.id}`}>{o.title}</Link>
              </td>
              <td>{o.status}</td>
              <td>{o.owner ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
