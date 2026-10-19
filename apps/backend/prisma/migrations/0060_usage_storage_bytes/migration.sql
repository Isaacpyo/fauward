-- WP-2.18 (L19): byte-accurate monthly storage usage (documents, proof-of-delivery files). Additive.

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN     "storageBytes" BIGINT NOT NULL DEFAULT 0;

