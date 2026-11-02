-- gtm.contracts (WP-4.19): quotes with prices, approval routing, send (DocuSign or PDF) and acceptance into an MSA,
-- an ACTIVE CustomContract and an ACTIVE PricingOverride. Additive, plus a status rename for rows the old handlers wrote.
-- AlterTable
ALTER TABLE "contract_approvals" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "quoteId" TEXT,
ADD COLUMN     "reasons" JSONB,
ADD COLUMN     "requestedBy" TEXT,
ALTER COLUMN "approverId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "msa_agreements" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "quoteId" TEXT,
ADD COLUMN     "signedVia" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "sales_quotes" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedBy" TEXT,
ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "listMonthly" DECIMAL(12,2),
ADD COLUMN     "netMonthly" DECIMAL(12,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "signedPdfFileName" TEXT,
ADD COLUMN     "signedPdfProvider" TEXT,
ADD COLUMN     "signerEmail" TEXT,
ADD COLUMN     "signerName" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- The pre-WP-4.19 handlers wrote these statuses; map them to the new flow.
UPDATE "sales_quotes" SET "status" = 'PENDING_APPROVAL' WHERE "status" = 'APPROVAL_REQUIRED';
UPDATE "sales_quotes" SET "status" = 'SENT' WHERE "status" = 'SENT_FOR_SIGNATURE';
UPDATE "sales_quotes" SET "status" = 'ACCEPTED' WHERE "status" = 'SIGNED';

-- CreateIndex
CREATE UNIQUE INDEX "msa_agreements_quoteId_key" ON "msa_agreements"("quoteId");

-- CreateIndex (fails if two quotes share an envelope id; the pre-check is SELECT "docusignEnvelopeId", COUNT(*) FROM "sales_quotes" WHERE "docusignEnvelopeId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1)
CREATE UNIQUE INDEX "sales_quotes_docusignEnvelopeId_key" ON "sales_quotes"("docusignEnvelopeId");

-- CreateIndex
CREATE INDEX "sales_quotes_status_createdAt_idx" ON "sales_quotes"("status", "createdAt");
