-- AlterTable
ALTER TABLE "AnalysisJob" ADD COLUMN     "councilSessionId" TEXT,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "progress" JSONB,
ADD COLUMN     "context" JSONB,
ADD COLUMN     "lastPolledAt" TIMESTAMP(3),
ADD COLUMN     "unreachableSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "description" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "focusAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notes" TEXT;
