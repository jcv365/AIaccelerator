import type { Prisma, PrismaClient } from "@prisma/client";

// Deleting data the user asked to remove. The schema has no cascades below Opportunity, so children go first,
// all inside one transaction: either everything is removed or nothing is.

export async function removeOpportunities(tx: Prisma.TransactionClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await tx.learning.deleteMany({ where: { experiment: { opportunityId: { in: ids } } } });
  await tx.experiment.deleteMany({ where: { opportunityId: { in: ids } } });
  await tx.decision.deleteMany({ where: { opportunityId: { in: ids } } });
  await tx.evidence.deleteMany({ where: { opportunityId: { in: ids } } });
  await tx.opportunityAssessment.deleteMany({ where: { opportunityId: { in: ids } } });
  await tx.opportunityReport.deleteMany({ where: { opportunityId: { in: ids } } });
  const result = await tx.opportunity.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

export async function removeOpportunity(prisma: PrismaClient, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => (await removeOpportunities(tx, [id])) > 0);
}

export type CompanyRemoval = { removed: true; opportunities: number } | { removed: false; reason: "busy" };

/** Removes a company and everything that belongs to it. Refused while an analysis or report is running for it. */
export async function removeCompany(prisma: PrismaClient, companyId: string): Promise<CompanyRemoval> {
  return prisma.$transaction(async (tx) => {
    const running =
      (await tx.analysisJob.findFirst({ where: { companyId, status: { in: ["QUEUED", "RUNNING"] } } })) ??
      (await tx.companyReport.findFirst({ where: { companyId, status: "GENERATING" } }));
    if (running) return { removed: false as const, reason: "busy" as const };
    const ids = (await tx.opportunity.findMany({ where: { companyId }, select: { id: true } })).map((o) => o.id);
    const opportunities = await removeOpportunities(tx, ids);
    await tx.companyReport.deleteMany({ where: { companyId } }); // its files are removed with it (database cascade)
    await tx.readinessAssessment.deleteMany({ where: { companyId } });
    await tx.analysisJob.deleteMany({ where: { companyId } });
    await tx.company.delete({ where: { id: companyId } });
    return { removed: true as const, opportunities };
  });
}
