-- CreateEnum
CREATE TYPE "CompanyReportStatus" AS ENUM ('GENERATING', 'DRAFT', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliverableAudience" AS ENUM ('C_LEVEL', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "DeliverableFormat" AS ENUM ('PPTX', 'DOCX');

-- CreateTable
CREATE TABLE "CompanyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CompanyReportStatus" NOT NULL DEFAULT 'GENERATING',
    "stage" TEXT,
    "content" JSONB,
    "sources" JSONB,
    "qualityReport" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,

    CONSTRAINT "CompanyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "companyReportId" TEXT NOT NULL,
    "audience" "DeliverableAudience" NOT NULL,
    "format" "DeliverableFormat" NOT NULL,
    "filename" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyReport_companyId_createdAt_idx" ON "CompanyReport"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReport_companyId_version_key" ON "CompanyReport"("companyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_companyReportId_audience_format_key" ON "Deliverable"("companyReportId", "audience", "format");

-- AddForeignKey
ALTER TABLE "CompanyReport" ADD CONSTRAINT "CompanyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_companyReportId_fkey" FOREIGN KEY ("companyReportId") REFERENCES "CompanyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
