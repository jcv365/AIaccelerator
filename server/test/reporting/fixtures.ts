import type { ReportContent } from "../../src/reporting/content.js";
import type { Facts } from "../../src/reporting/facts.js";
import { buildAllowedNumbers } from "../../src/reporting/numbers.js";

/** A small, realistic, fully synthetic company: two opportunities, a handful of evidence rows, two sources. */
export function makeFacts(): Facts {
  const opportunities: Facts["opportunities"] = [
    {
      id: "o1",
      title: "Predictive maintenance for fleet assets",
      description: "Predict failures across a fleet of 700 vessels before they cause downtime.",
      businessProblem: "Unplanned downtime is costly and hard to schedule around.",
      status: "DISCOVERED",
      hypothesis: null,
      counts: { facts: 2, inferences: 1, assumptions: 0, hypotheses: 1 },
      evidence: [
        { claim: "Operates a fleet of 700 vessels", type: "FACT", confidence: 0.9, source: "https://www.acme-shipping.com/about", excerpt: null, sourceId: "S1" },
        { claim: "Maintenance is a major cost line", type: "FACT", confidence: 0.8, source: "https://www.acme-shipping.com/annual-report", excerpt: null, sourceId: "S2" },
        { claim: "Sensor data likely exists on newer vessels", type: "INFERENCE", confidence: 0.5, source: null, excerpt: null },
        { claim: "Failure prediction could cut downtime", type: "AI_HYPOTHESIS", confidence: 0.4, source: null, excerpt: null },
      ],
      decisions: [],
      experiments: [],
    },
    {
      id: "o2",
      title: "Automated customs documentation",
      description: "Extract and validate data from trade documents.",
      businessProblem: "Manual document handling slows clearance.",
      status: "DISCOVERED",
      hypothesis: null,
      counts: { facts: 1, inferences: 0, assumptions: 1, hypotheses: 0 },
      evidence: [
        { claim: "Handles customs brokerage for several acquired units", type: "FACT", confidence: 0.7, source: "https://www.acme-shipping.com/about", excerpt: null, sourceId: "S1" },
        { claim: "Document volumes are assumed to be high", type: "ASSUMPTION", confidence: 0.3, source: null, excerpt: null },
      ],
      decisions: [],
      experiments: [],
    },
  ];
  const texts = opportunities.flatMap((o) => [o.title, o.description ?? "", o.businessProblem ?? "", ...o.evidence.map((e) => e.claim)]);
  return {
    company: { id: "c1", name: "Acme Shipping", website: "https://www.acme-shipping.com" },
    opportunities,
    sources: [
      { id: "S1", kind: "Web", url: "https://www.acme-shipping.com/about", title: "acme-shipping.com" },
      { id: "S2", kind: "Web", url: "https://www.acme-shipping.com/annual-report", title: "acme-shipping.com" },
    ],
    allowedNumbers: buildAllowedNumbers(texts, [2, 4, 1, 0]),
    totals: { opportunities: 2, evidence: 6, sources: 2 },
  };
}

/** A report content that satisfies the schema and every quality gate against makeFacts(). */
export function makeValidContent(): ReportContent {
  return {
    schemaVersion: 1,
    company: { name: "Acme Shipping", website: "https://www.acme-shipping.com", summary: "A global shipping operator with a fleet of 700 vessels and a growing logistics arm." },
    executive: {
      headline: "Two AI opportunities stand out for Acme Shipping",
      paragraphs: [
        "Public material shows a large fleet and a heavy maintenance cost line, which makes predictive maintenance the strongest candidate.",
        "Customs documentation is a second opportunity, but the evidence for it is thinner and partly assumed.",
      ],
      recommendation: "Start with a 14-day proof of value on predictive maintenance for one vessel class.",
      boardAsk: "Approve a 14-day proof of value and name a data owner for maintenance records.",
    },
    priorities: [{ priority: "Reduce operating cost across the fleet", sourceIds: ["S2"] }],
    opportunities: [
      {
        opportunityId: "o1",
        rank: 1,
        summary: "Predict equipment failures from maintenance and sensor data to plan work before breakdowns.",
        whyItMatters: "Maintenance is a major cost line and downtime disrupts schedules.",
        feasibility: "Sensor availability is inferred, not confirmed, and must be checked in discovery.",
        risks: ["Sensor data may be incomplete on older vessels"],
        dataNeeded: ["Maintenance and failure history", "Sensor data where available"],
        firstStep: "Back-test a failure model on one vessel class against known failures.",
        ratings: { value: "HIGH", feasibility: "MEDIUM", risk: "MEDIUM", confidence: "MEDIUM" },
        ratingRationale: "Strong public evidence of scale and cost; data readiness is the main unknown.",
        evidence: { facts: 2, inferences: 1, assumptions: 0, hypotheses: 1 },
        sourceIds: ["S1", "S2"],
      },
      {
        opportunityId: "o2",
        rank: 2,
        summary: "Extract and validate data from trade documents to speed up customs clearance.",
        whyItMatters: "Manual handling slows clearance and adds cost.",
        feasibility: "Document formats vary by unit, so a pilot should start with one document type.",
        risks: ["Document volumes are assumed, not evidenced"],
        dataNeeded: ["A sample of recent trade documents"],
        firstStep: "Process a sample of one document type and measure extraction accuracy.",
        ratings: { value: "MEDIUM", feasibility: "MEDIUM", risk: "LOW", confidence: "LOW" },
        ratingRationale: "Plausible fit, but volume and format evidence is limited.",
        evidence: { facts: 1, inferences: 0, assumptions: 1, hypotheses: 0 },
        sourceIds: ["S1"],
      },
    ],
    roadmap: {
      phases: [
        { name: "Discover", duration: "2 weeks", objectives: ["Confirm data availability"], deliverables: ["Data inventory"] },
        { name: "Prove", duration: "14 days", objectives: ["Run the proof of value"], deliverables: ["Results and go or no-go decision"] },
        { name: "Scale", duration: "To be agreed", objectives: ["Plan the production rollout"], deliverables: [] },
      ],
    },
    risks: [
      { risk: "Data is not available or not clean enough", likelihood: "MEDIUM", impact: "HIGH", mitigation: "Confirm data access in the first two weeks before committing to a build." },
      { risk: "Low adoption by maintenance teams", likelihood: "MEDIUM", impact: "MEDIUM", mitigation: "Involve a maintenance lead in the proof of value and design." },
      { risk: "Findings rest partly on assumptions", likelihood: "HIGH", impact: "MEDIUM", mitigation: "Label assumptions and confirm each one during discovery." },
    ],
    technical: {
      architecture: [
        {
          opportunityId: "o1",
          components: [
            { name: "Data sources", role: "Maintenance logs and sensor feeds" },
            { name: "Ingestion and storage", role: "Collects and validates incoming data" },
            { name: "Failure model", role: "Scores assets by failure risk" },
            { name: "Work-order integration", role: "Sends ranked alerts to the maintenance system" },
          ],
          notes: "Assumes maintenance records can be exported with timestamps.",
        },
      ],
      dataRequirements: [
        { source: "Operating fleet size", neededFor: "Scoping the pilot", status: "PUBLIC_EVIDENCE", sourceIds: ["S1"] },
        { source: "Sensor data history", neededFor: "Failure model features", status: "TO_CONFIRM", sourceIds: [] },
      ],
      integration: ["Read access to the maintenance system through its export or API"],
      security: ["Keep data inside the client's environment and apply role-based access"],
      pov: {
        scope: "One vessel class, using existing maintenance history.",
        successMetric: "Agree a detection rate at a fixed false-alarm rate before the test starts.",
        goNoGo: "Proceed only if the agreed metric is met on held-out data.",
      },
    },
    evidenceNote: "Public evidence is limited for some areas; social-media content in particular was thin, so findings lean on the company website.",
    assumptions: ["Sensor data exists on newer vessels"],
    openQuestions: ["Who owns the maintenance records?"],
    glossary: [{ term: "Proof of value", definition: "A short, focused test that shows whether an AI use case works on the client's own data." }],
  };
}
