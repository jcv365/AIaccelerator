-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "analysisJobId" TEXT;

-- CreateIndex
CREATE INDEX "Opportunity_analysisJobId_idx" ON "Opportunity"("analysisJobId");

-- Backfill: each earlier run recorded the ids of the opportunities it created.
UPDATE "Opportunity" o
SET "analysisJobId" = j."id"
FROM "AnalysisJob" j
WHERE o."id" = ANY (j."opportunityIds");
