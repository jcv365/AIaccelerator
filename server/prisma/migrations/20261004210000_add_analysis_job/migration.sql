-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "opportunityIds" TEXT[],
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);
