-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "aiDraftFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
