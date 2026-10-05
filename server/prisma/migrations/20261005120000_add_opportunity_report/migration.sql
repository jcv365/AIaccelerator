-- CreateTable
CREATE TABLE "OpportunityReport" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityReport_opportunityId_createdAt_idx" ON "OpportunityReport"("opportunityId", "createdAt");

-- AddForeignKey
ALTER TABLE "OpportunityReport" ADD CONSTRAINT "OpportunityReport_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
