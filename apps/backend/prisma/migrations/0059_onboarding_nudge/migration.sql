-- WP-2.17 (L7): last console onboarding nudge per tenant. Additive. Onboarding steps become event timestamps; see backfill
-- 0059-onboarding-steps.ts (legacy click flags are ignored by the code).

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "onboardingNudgedAt" TIMESTAMP(3);

