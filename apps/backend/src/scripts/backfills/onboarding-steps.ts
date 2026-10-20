import type { PrismaClient } from '@prisma/client';
import { CORE_STEPS, ONBOARDING_STEPS, type OnboardingStep } from '../../services/onboarding.service.js';

export type OnboardingBackfillResult = {
  dryRun: boolean;
  tenants: number;
  stepsStamped: Record<OnboardingStep, number>;
  completed: number;
  /** Tenants whose onboardingCompletedAt came only from clicking through the old wizard and is cleared. */
  completionCleared: number;
};

const DEFAULT_PRIMARY = '#0D1F3C';

function earliest(...dates: Array<Date | null | undefined>) {
  const valid = dates.filter((date): date is Date => date instanceof Date);
  return valid.length > 0 ? new Date(Math.min(...valid.map((date) => date.getTime()))) : null;
}

/**
 * Backfill for WP-2.17 (migration 0059_onboarding_nudge): before it, `onboardingSteps` held booleans the tenant portal
 * set on every "Next" click. Each tenant's steps are re-derived from real data — the first branding audit (or saved
 * branding), first verified gateway, first shipment, first invited teammate's sign-in, custom domain verification,
 * first paid invoice — and stored as timestamps; the click flags are dropped and `onboardingCompletedAt` is the time
 * the last core step was reached (or null). `dryRun` only counts.
 */
export async function backfillOnboardingSteps(prisma: PrismaClient, options: { dryRun: boolean }): Promise<OnboardingBackfillResult> {
  const result: OnboardingBackfillResult = { dryRun: options.dryRun, tenants: 0, stepsStamped: Object.fromEntries(ONBOARDING_STEPS.map((step) => [step, 0])) as Record<OnboardingStep, number>, completed: 0, completionCleared: 0 };
  const tenants = await prisma.tenant.findMany({
    select: { id: true, logoUrl: true, brandName: true, primaryColor: true, updatedAt: true, customDomainVerifiedAt: true, onboardingCompletedAt: true }
  });
  for (const tenant of tenants) {
    result.tenants += 1;
    const [branding, gateway, shipment, teammate, invoice] = await Promise.all([
      prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: 'BRANDING_UPDATED' }, orderBy: { timestamp: 'asc' }, select: { timestamp: true } }),
      prisma.tenantPaymentGateway.findFirst({ where: { tenantId: tenant.id, status: 'VERIFIED', enabled: true }, orderBy: { lastVerifiedAt: 'asc' }, select: { lastVerifiedAt: true, updatedAt: true } }),
      prisma.shipment.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      prisma.user.findFirst({ where: { tenantId: tenant.id, invitedBy: { not: null }, lastLogin: { not: null } }, orderBy: { lastLogin: 'asc' }, select: { lastLogin: true } }),
      prisma.invoice.findFirst({ where: { tenantId: tenant.id, kind: 'TENANT_CUSTOMER', status: 'PAID', paidAt: { not: null } }, orderBy: { paidAt: 'asc' }, select: { paidAt: true } })
    ]);
    const branded = Boolean(tenant.logoUrl || tenant.brandName || (tenant.primaryColor && tenant.primaryColor !== DEFAULT_PRIMARY));
    const stamps: Partial<Record<OnboardingStep, Date>> = {};
    const brandingAt = branding?.timestamp ?? (branded ? tenant.updatedAt : null);
    if (brandingAt) stamps.BRANDING_SET = brandingAt;
    const gatewayAt = gateway ? earliest(gateway.lastVerifiedAt, gateway.updatedAt) : null;
    if (gatewayAt) stamps.GATEWAY_VERIFIED = gatewayAt;
    if (shipment) stamps.FIRST_SHIPMENT = shipment.createdAt;
    if (teammate?.lastLogin) stamps.TEAMMATE_JOINED = teammate.lastLogin;
    if (tenant.customDomainVerifiedAt) stamps.DOMAIN_VERIFIED = tenant.customDomainVerifiedAt;
    if (invoice?.paidAt) stamps.FIRST_PAID_INVOICE = invoice.paidAt;
    for (const step of Object.keys(stamps) as OnboardingStep[]) result.stepsStamped[step] += 1;
    const coreDone = CORE_STEPS.every((step) => stamps[step]);
    const completedAt = coreDone ? new Date(Math.max(...CORE_STEPS.map((step) => stamps[step]!.getTime()))) : null;
    if (completedAt) result.completed += 1;
    if (!completedAt && tenant.onboardingCompletedAt) result.completionCleared += 1;
    if (!options.dryRun) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { onboardingSteps: Object.fromEntries(Object.entries(stamps).map(([step, at]) => [step, at.toISOString()])), onboardingCompletedAt: completedAt }
      });
    }
  }
  return result;
}
