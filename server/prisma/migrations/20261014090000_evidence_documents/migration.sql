-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "documentId" TEXT;

-- CreateTable
CREATE TABLE "EvidenceDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvidenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceDocument_companyId_uploadedAt_idx" ON "EvidenceDocument"("companyId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceDocument_companyId_sha256_key" ON "EvidenceDocument"("companyId", "sha256");

-- CreateIndex
CREATE INDEX "Evidence_documentId_idx" ON "Evidence"("documentId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EvidenceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceDocument" ADD CONSTRAINT "EvidenceDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
