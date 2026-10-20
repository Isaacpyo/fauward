import { describe, expect, it, vi } from 'vitest';
import { backfillOnboardingSteps } from './onboarding-steps.js';

// Backfill 0059-onboarding-steps (WP-2.17): click flags are dropped; steps come from real data.

function fixture() {
  const t = (iso: string) => new Date(iso);
  const tenants = [
    // Clicked through the wizard (all flags true, completedAt set) but did nothing real.
    { id: 't_clicker', logoUrl: null, brandName: null, primaryColor: '#0D1F3C', updatedAt: t('2026-09-01T00:00:00Z'), customDomainVerifiedAt: null, onboardingCompletedAt: t('2026-09-01T00:05:00Z'), onboardingSteps: { BRANDING: true, TEAM: true, PAYMENT: true, FIRST_SHIPMENT: true, GO_LIVE: true } },
    // Really onboarded.
    { id: 't_real', logoUrl: 'https://cdn/logo.png', brandName: 'Real', primaryColor: '#123456', updatedAt: t('2026-09-02T00:00:00Z'), customDomainVerifiedAt: null, onboardingCompletedAt: null, onboardingSteps: {} }
  ];
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const forReal = (tenantId: string, value: unknown) => (tenantId === 't_real' ? value : null);
  const prisma = {
    updates,
    tenant: { findMany: vi.fn(async () => tenants), update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => updates.push({ id: where.id, data })) },
    auditLog: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => forReal(where.tenantId, { timestamp: t('2026-09-02T10:00:00Z') })) },
    tenantPaymentGateway: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => forReal(where.tenantId, { lastVerifiedAt: t('2026-09-03T10:00:00Z'), updatedAt: t('2026-09-03T10:00:00Z') })) },
    shipment: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => forReal(where.tenantId, { createdAt: t('2026-09-04T10:00:00Z') })) },
    user: { findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => forReal(where.tenantId, { lastLogin: t('2026-09-05T10:00:00Z') })) },
    invoice: { findFirst: vi.fn(async () => null) }
  };
  return prisma;
}

describe('backfill 0059-onboarding-steps', () => {
  it('dry run counts: the click-through tenant loses its completion, the real one completes when its last core step happened', async () => {
    const prisma = fixture();
    const result = await backfillOnboardingSteps(prisma as never, { dryRun: true });
    expect(result).toMatchObject({ tenants: 2, completed: 1, completionCleared: 1, stepsStamped: { BRANDING_SET: 1, GATEWAY_VERIFIED: 1, FIRST_SHIPMENT: 1, TEAMMATE_JOINED: 1, DOMAIN_VERIFIED: 0, FIRST_PAID_INVOICE: 0 } });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('writes timestamps only (no click flags)', async () => {
    const prisma = fixture();
    await backfillOnboardingSteps(prisma as never, { dryRun: false });
    expect(prisma.updates).toEqual([
      { id: 't_clicker', data: { onboardingSteps: {}, onboardingCompletedAt: null } },
      {
        id: 't_real',
        data: {
          onboardingSteps: { BRANDING_SET: '2026-09-02T10:00:00.000Z', GATEWAY_VERIFIED: '2026-09-03T10:00:00.000Z', FIRST_SHIPMENT: '2026-09-04T10:00:00.000Z', TEAMMATE_JOINED: '2026-09-05T10:00:00.000Z' },
          onboardingCompletedAt: new Date('2026-09-05T10:00:00.000Z')
        }
      }
    ]);
  });
});
