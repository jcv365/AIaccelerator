-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DISCOVERED', 'QUALIFIED', 'HYPOTHESIS', 'EXPERIMENT', 'PROVING', 'PROVEN', 'REJECTED', 'DEFERRED', 'NO_AI');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('FACT', 'INFERENCE', 'ASSUMPTION', 'AI_HYPOTHESIS');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "businessProblem" TEXT,
    "potentialValue" TEXT,
    "complexity" TEXT,
    "dependencies" TEXT,
    "aiSuitability" TEXT,
    "risks" TEXT,
    "owner" TEXT,
    "hypothesis" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DISCOVERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT,
    "location" TEXT,
    "excerpt" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT,
    "assumptions" TEXT,
    "confidence" DOUBLE PRECISION,
    "alternativesConsidered" TEXT,
    "risks" TEXT,
    "owner" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
