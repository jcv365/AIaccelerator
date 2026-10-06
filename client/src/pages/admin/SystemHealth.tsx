import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { DataTable, InlineAlert, PageHeader, ProgressIndicator, StatusBadge } from "../../components/ui";

interface HealthRow {
  check: string;
  ok: boolean;
  detail: string;
}

async function probe(path: string, describe: (body: Record<string, unknown>) => string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await apiFetch(path);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = (body.error as { message?: string } | undefined)?.message;
      return { ok: false, detail: message ?? `HTTP ${res.status}` };
    }
    return { ok: true, detail: describe(body) };
  } catch {
    return { ok: false, detail: "Unreachable" };
  }
}

export default function SystemHealth() {
  const [rows, setRows] = useState<HealthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      probe("/health", () => "Server process is responding"),
      probe("/ready", () => "Database connection is healthy"),
      probe("/version", (b) => `Version ${String(b.version ?? "unknown")} (commit ${String(b.commit ?? "unknown")})`),
    ])
      .then(([health, ready, version]) =>
        setRows([
          { check: "Liveness (/health)", ...health },
          { check: "Readiness (/ready)", ...ready },
          { check: "Build (/version)", ...version },
        ]),
      )
      .catch(() => setError("Could not run the health checks."));
  }, []);

  return (
    <main>
      <PageHeader title="System Health" description="Live checks against the backend service and its database." />
      {!rows && !error && <ProgressIndicator label="Running health checks…" />}
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {rows && (
        <DataTable
          columns={[
            { key: "check", header: "Check", render: (r: HealthRow) => r.check },
            {
              key: "status",
              header: "Status",
              render: (r: HealthRow) => <StatusBadge label={r.ok ? "OK" : "Failing"} tone={r.ok ? "success" : "danger"} />,
            },
            { key: "detail", header: "Detail", render: (r: HealthRow) => r.detail },
          ]}
          rows={rows}
          getRowKey={(r) => r.check}
        />
      )}
    </main>
  );
}
