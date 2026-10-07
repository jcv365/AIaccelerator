import type { PrismaClient } from "@prisma/client";
import type { EvidenceCounts } from "./content.js";
import { buildAllowedNumbers } from "./numbers.js";
import { buildSourceRegister, type SourceRef } from "./sources.js";

// The saved facts a company-level report is allowed to rest on. Read once from the database; the model is
// given these as its only material, and the quality gates later check the report against them (counts, source
// ids, and the figures it uses).

export interface FactEvidence {
  claim: string;
  type: "FACT" | "INFERENCE" | "ASSUMPTION" | "AI_HYPOTHESIS";
  confidence: number | null;
  source: string | null;
  excerpt: string | null;
  sourceId?: string;
}

export interface FactOpportunity {
  id: string;
  title: string;
  description: string | null;
  businessProblem: string | null;
  status: string;
  hypothesis: string | null;
  counts: EvidenceCounts;
  evidence: FactEvidence[];
  decisions: Array<{ decision: string; rationale: string | null }>;
  experiments: Array<{ title: string; status: string; resultSummary: string | null; success: boolean | null }>;
}

export interface Facts {
  company: { id: string; name: string; website: string | null };
  opportunities: FactOpportunity[];
  sources: SourceRef[];
  /** Figures the narrative may use: those in the saved text, plus counts computed here. */
  allowedNumbers: Set<string>;
  totals: { opportunities: number; evidence: number; sources: number };
}

const TYPE_TO_COUNT = {
  FACT: "facts",
  INFERENCE: "inferences",
  ASSUMPTION: "assumptions",
  AI_HYPOTHESIS: "hypotheses",
} as const;

/** `analysisId` limits the facts to the opportunities one analysis run found (a point-in-time report). */
export async function collectFacts(prisma: PrismaClient, companyId: string, analysisId?: string | null): Promise<Facts> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");

  const rows = await prisma.opportunity.findMany({
    where: { companyId, ...(analysisId ? { analysisJobId: analysisId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { evidence: true, decisions: true, experiments: true },
  });

  const allEvidence = rows.flatMap((o) => o.evidence);
  const { sources, idFor } = buildSourceRegister(allEvidence);

  const opportunities: FactOpportunity[] = rows.map((o) => {
    const counts: EvidenceCounts = { facts: 0, inferences: 0, assumptions: 0, hypotheses: 0 };
    const evidence: FactEvidence[] = o.evidence.map((e) => {
      counts[TYPE_TO_COUNT[e.type as keyof typeof TYPE_TO_COUNT]] += 1;
      return {
        claim: e.claim,
        type: e.type as FactEvidence["type"],
        confidence: e.confidence ?? null,
        source: e.source ?? null,
        excerpt: e.excerpt ?? null,
        sourceId: idFor(e.source),
      };
    });
    return {
      id: o.id,
      title: o.title,
      description: o.description ?? null,
      businessProblem: o.businessProblem ?? null,
      status: o.status,
      hypothesis: o.hypothesis ?? null,
      counts,
      evidence,
      decisions: o.decisions.map((d) => ({ decision: d.decision, rationale: d.rationale ?? null })),
      experiments: o.experiments.map((x) => ({
        title: x.title,
        status: x.status,
        resultSummary: x.resultSummary ?? null,
        success: x.success ?? null,
      })),
    };
  });

  const totals = { opportunities: opportunities.length, evidence: allEvidence.length, sources: sources.length };

  const texts: string[] = [company.name, company.website ?? ""];
  for (const o of opportunities) {
    texts.push(o.title, o.description ?? "", o.businessProblem ?? "", o.hypothesis ?? "");
    for (const e of o.evidence) texts.push(e.claim, e.excerpt ?? "", e.source ?? "");
    for (const d of o.decisions) texts.push(d.decision, d.rationale ?? "");
    for (const x of o.experiments) texts.push(x.title, x.resultSummary ?? "");
  }
  const counted: number[] = [totals.opportunities, totals.evidence, totals.sources];
  for (const o of opportunities) counted.push(o.counts.facts, o.counts.inferences, o.counts.assumptions, o.counts.hypotheses, o.evidence.length);

  return { company: { id: company.id, name: company.name, website: company.website ?? null }, opportunities, sources, allowedNumbers: buildAllowedNumbers(texts, counted), totals };
}
