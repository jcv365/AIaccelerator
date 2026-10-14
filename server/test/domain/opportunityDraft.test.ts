import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { parseDraftFields } from "../../src/domain/opportunityDraft.js";
import { buildGoal, persistOpportunities } from "../../src/domain/analysis.js";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

describe("parseDraftFields", () => {
  it("keeps valid values and lists which fields the AI filled", () => {
    const { data, fields } = parseDraftFields({
      hypothesis: "We believe triage will cut claim time by 30%, measured by days to settle.",
      potentialValue: "Faster claims, happier customers",
      estimatedAnnualValue: 6_500_000,
      category: "Operations",
      priority: "HIGH",
      complexity: "Medium: needs claims system access",
      dependencies: "Claims history, policy data",
      aiSuitability: "Text classification fits well",
      risks: "Data quality",
    });
    expect(data).toEqual({
      hypothesis: "We believe triage will cut claim time by 30%, measured by days to settle.",
      potentialValue: "Faster claims, happier customers",
      estimatedAnnualValue: 6_500_000,
      category: "Operations",
      priority: "HIGH",
      complexity: "Medium: needs claims system access",
      dependencies: "Claims history, policy data",
      aiSuitability: "Text classification fits well",
      risks: "Data quality",
    });
    expect(fields.sort()).toEqual(Object.keys(data).sort());
  });

  it("returns nothing when the AI gave none of them", () => {
    expect(parseDraftFields({ title: "T" })).toEqual({ data: {}, fields: [] });
  });

  it("drops values that are the wrong type, empty, out of range or unknown instead of failing", () => {
    const { data } = parseDraftFields({
      hypothesis: 42,
      potentialValue: "   ",
      risks: ["a", "b"],
      priority: "urgent",
      category: "x".repeat(81),
      estimatedAnnualValue: -5,
    });
    expect(data).toEqual({});
    for (const bad of ["6500000", Number.NaN, Number.POSITIVE_INFINITY, 1e13, null]) {
      expect(parseDraftFields({ estimatedAnnualValue: bad }).data).toEqual({});
    }
  });

  it("normalises priority case, rounds the value, trims text and removes control characters", () => {
    const { data } = parseDraftFields({
      priority: "high",
      estimatedAnnualValue: 1234567.6,
      risks: "  Data\u0000 quality \n",
    });
    expect(data).toEqual({ priority: "HIGH", estimatedAnnualValue: 1234568, risks: "Data quality" });
  });

  it("cuts very long text at 2000 characters", () => {
    expect((parseDraftFields({ risks: "r".repeat(5000) }).data.risks as string).length).toBe(2000);
  });
});

describe("buildGoal asks for the richer fields without letting the AI guess", () => {
  it("lists every field in the JSON contract and says to leave out what the evidence does not support", () => {
    const goal = buildGoal("Maersk");
    for (const f of ["hypothesis", "potentialValue", "estimatedAnnualValue", "category", "priority", "complexity", "dependencies", "aiSuitability", "risks"]) {
      expect(goal).toContain(`"${f}"`);
    }
    expect(goal).toMatch(/optional/i);
    expect(goal).toMatch(/never guess/i);
  });
});

describe("persistOpportunities stores the draft fields", () => {
  function prismaMock() {
    const oppCreate = vi.fn().mockResolvedValue({ id: "opp1" });
    const prisma: Record<string, unknown> = { opportunity: { create: oppCreate }, evidence: { create: vi.fn() } };
    prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    return { prisma, oppCreate };
  }
  const base = { title: "T", description: "D", businessProblem: "P" };

  it("saves valid draft fields and records them as AI drafts", async () => {
    const { prisma, oppCreate } = prismaMock();
    await persistOpportunities(prisma as never, [{ ...base, hypothesis: "We believe X", priority: "medium", estimatedAnnualValue: "lots" }], "c1", "j1");
    const data = oppCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: "T", hypothesis: "We believe X", priority: "MEDIUM", aiDraftFields: expect.arrayContaining(["hypothesis", "priority"]) });
    expect(data).not.toHaveProperty("estimatedAnnualValue");
    expect(data.aiDraftFields).toHaveLength(2);
  });

  it("still saves an opportunity that has none of them", async () => {
    const { prisma, oppCreate } = prismaMock();
    await persistOpportunities(prisma as never, [base], "c1", "j1");
    const data = oppCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("aiDraftFields");
    expect(data).not.toHaveProperty("hypothesis");
  });
});

describe("editing a field takes it off the AI-draft list", () => {
  function appWith(existing: Record<string, unknown>) {
    const update = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data }));
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(existing), update } };
    const app = express();
    app.use(express.json());
    app.use("/opportunities", createOpportunitiesRouter(prisma as never));
    return { app, update };
  }

  it("removes only the fields the user saved", async () => {
    const { app, update } = appWith({ id: "o1", title: "T", aiDraftFields: ["hypothesis", "risks", "priority"] });
    const res = await request(app).patch("/opportunities/o1").send({ hypothesis: "We believe Y", priority: "LOW" });
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ hypothesis: "We believe Y", priority: "LOW", aiDraftFields: ["risks"] });
  });

  it("leaves the list alone when no drafted field is touched", async () => {
    const { app, update } = appWith({ id: "o1", title: "T", aiDraftFields: ["risks"] });
    await request(app).patch("/opportunities/o1").send({ title: "New title" });
    expect(update.mock.calls[0][0].data).toEqual({ title: "New title" });
  });

  it("does not let a client write the list directly", async () => {
    const { app, update } = appWith({ id: "o1", title: "T", aiDraftFields: ["risks"] });
    await request(app).patch("/opportunities/o1").send({ title: "x", aiDraftFields: [] });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("aiDraftFields");
  });
});
