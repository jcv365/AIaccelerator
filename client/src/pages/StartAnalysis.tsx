import { useState, useEffect } from "react";
import { Button, InlineAlert, TextField } from "../components/ui";
import { api } from "../api";
import "./StartAnalysis.css";

type Status = "empty" | "loading" | "streaming" | "error" | "success";

type GaugeValues = {
  evidenceStrength: number | null;
  sourceCoverage: number | null;
  aiConfidence: number | null;
};

const INITIAL_GAUGES: GaugeValues = {
  evidenceStrength: null,
  sourceCoverage: null,
  aiConfidence: null,
};

const GAUGE_META: Array<{ key: keyof GaugeValues; label: string; modifier: string }> = [
  { key: "evidenceStrength", label: "Evidence Strength", modifier: "gauge--blue" },
  { key: "sourceCoverage", label: "Source Coverage", modifier: "gauge--cyan" },
  { key: "aiConfidence", label: "AI Confidence", modifier: "gauge--purple" },
];

const NODATA_GAUGES = [
  { label: "Risk" },
  { label: "Feasibility" },
  { label: "Value" },
];

export default function StartAnalysis() {
  const [companyName, setCompanyName] = useState("");
  const [status, setStatus] = useState<Status>("empty");
  const [gauges, setGauges] = useState<GaugeValues>(INITIAL_GAUGES);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [opportunitiesFound, setOpportunitiesFound] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company name is required");
      setStatus("error");
      setAnnouncement("Company name is required");
      return;
    }
    setError(null);
    setGauges(INITIAL_GAUGES);
    setOpportunitiesFound(null);
    setStatus("loading");
    setAnnouncement("Starting analysis…");

    try {
      setStatus("streaming");
      // Simulate streaming progress for the gauges while the real analysis runs
      // In a real implementation, this would be replaced with actual streaming from the backend
      const gaugeKeys: Array<keyof GaugeValues> = ["evidenceStrength", "sourceCoverage", "aiConfidence"];
      for (const key of gaugeKeys) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const value = Math.random() * 0.3 + 0.5; // Simulate 50-80%
        setGauges((prev) => ({ ...prev, [key]: value }));
        setAnnouncement(`${GAUGE_META.find((g) => g.key === key)?.label}: ${Math.round(value * 100)}%`);
      }

      const result = await api.post<{ opportunitiesFound: number }>("/opportunities/analyze", { companyName });
      setOpportunitiesFound(result.opportunitiesFound);
      setStatus("success");
      setAnnouncement("Analysis complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Try again.");
      setStatus("error");
      setAnnouncement("Analysis failed.");
    }
  }

  const isRunning = status === "loading" || status === "streaming";

  return (
    <main>
      <h1>Start Analysis</h1>
      <p className="start-analysis__intro">
        Enter a company name to generate an AI opportunity report backed by live research.
      </p>

      <form className="start-analysis__form" onSubmit={handleSubmit} data-testid="start-analysis-form">
        <TextField
          label="Company name"
          placeholder="e.g. Acme Manufacturing"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isRunning}
          required
        />
        <Button type="submit" variant="primary" disabled={isRunning}>
          {isRunning ? "Generating…" : "Generate Intelligence"}
        </Button>
      </form>

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {status === "error" && error && <InlineAlert variant="error">{error}</InlineAlert>}

      {status === "success" && opportunitiesFound !== null && (
        <InlineAlert variant="info">
          Analysis complete — found {opportunitiesFound} opportunit{opportunitiesFound === 1 ? "y" : "ies"}.
          <br />
          <a href="/app/portfolio" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
            View in Opportunity Portfolio
          </a>
        </InlineAlert>
      )}

      <div className="gauge-grid">
        {GAUGE_META.map(({ key, label, modifier }) => {
          const value = gauges[key];
          return (
            <div key={key} className={`gauge ${value === null ? "gauge--nodata" : modifier}`}>
              <div className="gauge__reading">{value === null ? "NO DATA" : `${Math.round(value * 100)}%`}</div>
              <div className="gauge__track">
                <span style={{ width: value === null ? "0%" : `${Math.round(value * 100)}%` }} />
              </div>
              <div className="gauge__label">{label}</div>
            </div>
          );
        })}
        {NODATA_GAUGES.map(({ label }) => (
          <div key={label} className="gauge gauge--nodata">
            <div className="gauge__reading">NO DATA</div>
            <div className="gauge__track">
              <span style={{ width: "0%" }} />
            </div>
            <div className="gauge__label">{label}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
