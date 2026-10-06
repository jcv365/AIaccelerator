-- AlterTable
ALTER TABLE "AnalysisJob" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_nameKey_key" ON "Company"("nameKey");

-- CreateIndex
CREATE INDEX "AnalysisJob_companyId_idx" ON "AnalysisJob"("companyId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (does nothing on a fresh database): file every existing SUCCESSFUL analysis, and the
-- opportunities it created, under a company named after it. The nameKey expression matches the
-- application's normalisation (trim, collapse whitespace, lower-case).
INSERT INTO "Company" ("id", "name", "nameKey", "createdAt")
SELECT 'cmp_' || md5(s.k), s.n, s.k, CURRENT_TIMESTAMP
FROM (
    SELECT lower(regexp_replace(btrim("companyName"), '\s+', ' ', 'g')) AS k,
           min(btrim("companyName")) AS n
    FROM "AnalysisJob"
    WHERE "status" = 'SUCCEEDED'
    GROUP BY 1
) s
ON CONFLICT ("nameKey") DO NOTHING;

UPDATE "AnalysisJob" j
SET "companyId" = c."id"
FROM "Company" c
WHERE c."nameKey" = lower(regexp_replace(btrim(j."companyName"), '\s+', ' ', 'g'));

UPDATE "Opportunity" o
SET "companyId" = j."companyId"
FROM "AnalysisJob" j
WHERE j."status" = 'SUCCEEDED'
  AND j."companyId" IS NOT NULL
  AND o."id" = ANY (j."opportunityIds");
