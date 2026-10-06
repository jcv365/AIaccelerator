-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('PROCEED_TO_POV', 'INVESTIGATE', 'STOP', 'NO_AI');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "category" TEXT,
ADD COLUMN     "estimatedAnnualValue" INTEGER,
ADD COLUMN     "priority" "Priority";

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "quality" JSONB,
ADD COLUMN     "qualityAt" TIMESTAMP(3),
ADD COLUMN     "qualityModel" TEXT;

-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN     "plannedDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "team" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "OpportunityAssessment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "estimatedAnnualValue" INTEGER,
    "priority" "Priority" NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "effort" "Level" NOT NULL,
    "risk" "Level" NOT NULL,
    "whyBelieve" TEXT[],
    "couldDisprove" TEXT[],
    "rationale" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessAssessment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "overall" INTEGER NOT NULL,
    "dimensions" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardReport" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandardReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityAssessment_opportunityId_createdAt_idx" ON "OpportunityAssessment"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "ReadinessAssessment_companyId_createdAt_idx" ON "ReadinessAssessment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "StandardReport_type_createdAt_idx" ON "StandardReport"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "OpportunityAssessment" ADD CONSTRAINT "OpportunityAssessment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAssessment" ADD CONSTRAINT "ReadinessAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

