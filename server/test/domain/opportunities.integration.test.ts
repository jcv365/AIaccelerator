import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { createPrismaClient } from "../../src/db/prisma.js";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

// Requires a reachable, migrated Postgres at DATABASE_URL. Run explicitly
// via `npm run test:integration`; not part of the default `npm test`.
describe("opportunities router (integration)", () => {
  const prisma = createPrismaClient();
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma));

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates, reads, transitions, and lists a real opportunity end to end", async () => {
    const createRes = await request(app).post("/opportunities").send({ title: "Integration test opportunity" });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const getRes = await request(app).get(`/opportunities/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("DISCOVERED");

    const statusRes = await request(app).patch(`/opportunities/${id}/status`).send({ status: "QUALIFIED" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("QUALIFIED");

    const listRes = await request(app).get("/opportunities");
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((o: { id: string }) => o.id === id)).toBe(true);

    await prisma.decision.deleteMany({ where: { opportunityId: id } });
    await prisma.evidence.deleteMany({ where: { opportunityId: id } });
    await prisma.opportunity.delete({ where: { id } });
  });
});
