import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { InlineAlert, ProgressIndicator, Tabs, TabPanel } from "../components/ui";
import { ConnectorsTab } from "../components/app/opportunity/ConnectorsTab";
import { DecisionTab } from "../components/app/opportunity/DecisionTab";
import { EvidenceTab } from "../components/app/opportunity/EvidenceTab";
import { ExperimentsTab } from "../components/app/opportunity/ExperimentsTab";
import { OverviewTab } from "../components/app/opportunity/OverviewTab";
import { ReasoningTab, type ReportData } from "../components/app/opportunity/ReasoningTab";
import type { OpportunityDetailData } from "../components/app/opportunity/types";

type Tab = "overview" | "reasoning" | "evidence" | "connectors" | "experiments" | "decision";

const TAB_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "reasoning", label: "Reasoning" },
  { id: "evidence", label: "Evidence" },
  { id: "connectors", label: "Connectors" },
  { id: "experiments", label: "Experiments" },
  { id: "decision", label: "Decision" },
];

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [actionError, setActionError] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    apiFetch(`/opportunities/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunityDetailData) => {
        setOpportunity(data);
        setLoadError(null);
      })
      .catch(() => setLoadError("Could not load this opportunity."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [id]);

  async function handleStatusChange(status: string) {
    setActionError(null);
    const res = await apiFetch(`/opportunities/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, "Failed to update status"));
      return;
    }
    reload();
  }

  async function handleSaveHypothesis(hypothesis: string) {
    setActionError(null);
    const res = await apiFetch(`/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesis }),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, "Failed to save hypothesis"));
      return;
    }
    reload();
  }

  async function handleGenerateReport(): Promise<ReportData> {
    const res = await apiFetch(`/opportunities/${id}/report`, { method: "POST" });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to generate report"));
    }
    const body = (await res.json()) as { report: string; createdAt?: string | null };
    return { report: body.report, createdAt: body.createdAt ?? null };
  }

  // The newest saved report, or null if there is none or it cannot be loaded - a missing report is
  // normal (nothing generated yet) and must never surface as an error.
  async function handleLoadSavedReport(): Promise<ReportData | null> {
    try {
      const res = await apiFetch(`/opportunities/${id}/report`);
      if (!res.ok) return null;
      const body = (await res.json()) as { report?: unknown; createdAt?: unknown };
      if (typeof body.report !== "string") return null;
      return { report: body.report, createdAt: typeof body.createdAt === "string" ? body.createdAt : null };
    } catch {
      return null;
    }
  }

  async function handleAddEvidence(claim: string, type: string) {
    const res = await apiFetch(`/opportunities/${id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim, type }),
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to add evidence"));
    }
    reload();
  }

  async function handleAddDecision(decision: string) {
    const res = await apiFetch(`/opportunities/${id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to save decision"));
    }
    reload();
  }

  async function handleAddExperiment(title: string, method: string) {
    const res = await apiFetch(`/opportunities/${id}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, method }),
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to add experiment"));
    }
    reload();
  }

  if (loading) {
    return (
      <main>
        <ProgressIndicator label="Loading opportunity…" />
      </main>
    );
  }

  if (loadError || !opportunity) {
    return (
      <main>
        <InlineAlert variant="error">{loadError ?? "Opportunity not found."}</InlineAlert>
      </main>
    );
  }

  return (
    <main>
      <h1>{opportunity.title}</h1>
      {actionError && <InlineAlert variant="error">{actionError}</InlineAlert>}

      <Tabs items={TAB_ITEMS} activeId={activeTab} onChange={(id) => setActiveTab(id as Tab)} aria-label="Opportunity sections" />

      <TabPanel id="overview" activeId={activeTab}>
        <OverviewTab opportunity={opportunity} onStatusChange={handleStatusChange} />
      </TabPanel>
      <TabPanel id="reasoning" activeId={activeTab}>
        <ReasoningTab
          hypothesis={opportunity.hypothesis}
          onSaveHypothesis={handleSaveHypothesis}
          onGenerateReport={handleGenerateReport}
          onLoadSavedReport={handleLoadSavedReport}
        />
      </TabPanel>
      <TabPanel id="evidence" activeId={activeTab}>
        <EvidenceTab evidence={opportunity.evidence} onAddEvidence={handleAddEvidence} />
      </TabPanel>
      <TabPanel id="connectors" activeId={activeTab}>
        <ConnectorsTab />
      </TabPanel>
      <TabPanel id="experiments" activeId={activeTab}>
        <ExperimentsTab
          opportunityId={opportunity.id}
          experiments={opportunity.experiments}
          onAddExperiment={handleAddExperiment}
        />
      </TabPanel>
      <TabPanel id="decision" activeId={activeTab}>
        <DecisionTab decisions={opportunity.decisions} onAddDecision={handleAddDecision} />
      </TabPanel>
    </main>
  );
}
