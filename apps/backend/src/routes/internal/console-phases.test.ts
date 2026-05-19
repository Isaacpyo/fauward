import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let currentPermissions: Permission[] = [];
let currentRoles: string[] = ['FINANCE_ADMIN'];
const writeAuditMock = vi.fn(async () => undefined);
const scheduledAddMock = vi.fn(async (name: string) => ({ id: 'job_001', name }));

vi.mock('@fauward/internal-audit', () => ({
  writeAudit: writeAuditMock
}));

vi.mock('../../queues/queues.js', () => ({
  scheduledJobsQueue: {
    add: scheduledAddMock
  }
}));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'staff_001', email: 'ops@fauward.com', role: 'SUPER_ADMIN' },
      session: { id: 'platform_session_001' }
    };
  }
}));

vi.mock('../../middleware/require-platform-csrf.js', () => ({
  requirePlatformCsrf: async () => undefined
}));

vi.mock('../../middleware/require-internal-permission.js', () => ({
  requireInternalPermission: (permission: Permission) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    if (!currentPermissions.includes(permission)) return reply.status(403).send({ error: 'Forbidden', permission });
    return undefined;
  }
}));

vi.mock('../../services/staff-iam.service.js', () => ({
  staffPermissionContextForPlatformUser: async () => ({
    staff: { id: 'staff_user_001' },
    roles: currentRoles,
    permissions: currentPermissions
  })
}));

function delegate(overrides: Record<string, unknown> = {}) {
  return {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'created_001', ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'updated_001', ...data })),
    upsert: vi.fn(async (args: unknown) => ({ id: 'upserted_001', args })),
    count: vi.fn(async () => 0),
    ...overrides
  };
}

async function buildApp(prisma: Record<string, unknown>) {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  const { registerInternalConsolePhaseRoutes } = await import('../../modules/internal/console-phases.routes.js');
  await registerInternalConsolePhaseRoutes(app);
  return app;
}

function rawPayload(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  return rawBody;
}

function pagerDutyWebhookHeaders(secret: string, payload: unknown, timestamp = String(Date.now())) {
  const signature = createHmac('sha256', secret).update(rawPayload(payload)).digest('hex');
  return {
    'x-pagerduty-signature': `v1=${signature}`,
    'x-pagerduty-request-timestamp': timestamp
  };
}

function personaWebhookHeaders(secret: string, payload: unknown, timestamp = String(Date.now())) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawPayload(payload)}`).digest('hex');
  return {
    'persona-signature': `t=${timestamp},v1=${signature}`
  };
}

function docusignWebhookHeaders(secret: string, payload: unknown, timestamp = String(Date.now())) {
  const signature = createHmac('sha256', secret).update(rawPayload(payload)).digest('base64');
  return {
    'x-docusign-signature-1': signature,
    'x-docusign-timestamp': timestamp
  };
}

function complyAdvantageWebhookHeaders(secret: string, payload: unknown, timestamp = String(Math.floor(Date.now() / 1000)), webhookId = 'webhook_001') {
  const signature = createHmac('sha256', Buffer.from(secret)).update(`${webhookId}.${timestamp}.${rawPayload(payload)}`).digest('base64');
  return {
    'webhook-id': webhookId,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`
  };
}

describe('internal console phase routes', () => {
  beforeEach(() => {
    currentPermissions = [];
    currentRoles = ['FINANCE_ADMIN'];
    vi.unstubAllGlobals();
    delete process.env.PAGERDUTY_WEBHOOK_SECRET;
    delete process.env.PERSONA_WEBHOOK_SECRET;
    delete process.env.COMPLYADVANTAGE_WEBHOOK_SECRET;
    delete process.env.DOCUSIGN_WEBHOOK_SECRET;
    delete process.env.LAUNCHDARKLY_API_TOKEN;
    delete process.env.PERSONA_API_KEY;
    delete process.env.COMPLYADVANTAGE_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('suspends a tenant after dunning retry attempts exceed the limit and writes audit', async () => {
    currentPermissions = ['revenue.dunning.write'];
    const tenant = { id: 'tenant_001', name: 'Acme', status: 'ACTIVE' };
    const prisma = {
      invoice: { findUnique: vi.fn(async () => ({ id: 'inv_001', tenantId: tenant.id, tenant })) },
      tenant: { update: vi.fn(async () => ({ ...tenant, status: 'SUSPENDED' })) },
      dunningEvent: delegate({ count: vi.fn(async () => 3) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/dunning/retry/inv_001', payload: { reason: 'Retry ceiling' } });

    expect(response.statusCode).toBe(200);
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: tenant.id }, data: { status: 'SUSPENDED' } });
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'dunning.tenant.suspend_after_retry_limit', target_id: tenant.id }));
  });

  it('rejects self approval for JIT requests', async () => {
    currentPermissions = ['trust.jit.approve'];
    const prisma = {
      jitAccessRequest: delegate({ findUnique: vi.fn(async () => ({ id: 'jit_001', requesterPlatformUserId: 'staff_001', rootRequest: false, durationMinutes: 60 })) }),
      jitAccessApproval: delegate()
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/jit/requests/jit_001/approve', payload: { notes: 'self' } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Self approval is not allowed' });
  });

  it('requires CFO-level permission for quote discounts over 25 percent', async () => {
    currentPermissions = ['gtm.contracts.write', 'gtm.contracts.discount.large'];
    const prisma = {
      salesQuote: delegate({ findUnique: vi.fn(async () => ({ id: 'quote_001', discountPercent: '30' })) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/contracts/quotes/quote_001/approve', payload: { reason: 'large discount' } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'CFO approval required', required: 'revenue.subscriptions.override' });
  });

  it('queues manual health scoring runs instead of computing synchronously', async () => {
    currentPermissions = ['customer.success.write'];
    const prisma = {};
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/success/health-scoring/run', payload: { reason: 'manual' } });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ queued: true, jobId: 'job_001', name: 'customer.health-scoring' });
    expect(scheduledAddMock).toHaveBeenCalledWith(
      'customer.health-scoring',
      { requestedBy: 'staff_001', source: 'manual-console' },
      expect.objectContaining({ jobId: expect.stringContaining('customer.health-scoring.manual.') })
    );
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'success.health_score.enqueue' }));
  });

  it('fails closed for production PagerDuty webhooks when the secret is missing', async () => {
    const prisma = { incidentRecord: delegate() };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', payload: { incident: { id: 'pd_001' } } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'PAGERDUTY_WEBHOOK_SECRET_NOT_CONFIGURED' });
  });

  it('persists signed PagerDuty webhook events', async () => {
    process.env.PAGERDUTY_WEBHOOK_SECRET = 'pd_secret';
    const incidentRecord = delegate();
    const prisma = { incidentRecord };
    const app = await buildApp(prisma);

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/incidents/webhooks/pagerduty',
      headers: pagerDutyWebhookHeaders('pd_secret', { incident: { id: 'pd_001', title: 'Carrier API outage', status: 'triggered', urgency: 'high' } }),
      payload: { incident: { id: 'pd_001', title: 'Carrier API outage', status: 'triggered', urgency: 'high' } }
    });

    expect(response.statusCode).toBe(200);
    expect(incidentRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { vendorId: 'pd_001' },
      create: expect.objectContaining({ vendor: 'pagerduty', vendorId: 'pd_001', title: 'Carrier API outage', payload: expect.objectContaining({ _webhookVerification: expect.any(Object) }) }),
      update: expect.objectContaining({ title: 'Carrier API outage', status: 'triggered', payload: expect.objectContaining({ _webhookVerification: expect.any(Object) }) })
    }));
  });

  it('rejects forged PagerDuty webhook signatures', async () => {
    process.env.PAGERDUTY_WEBHOOK_SECRET = 'pd_secret';
    const incidentRecord = delegate();
    const prisma = { incidentRecord };
    const app = await buildApp(prisma);
    const payload = { incident: { id: 'pd_001', title: 'Carrier API outage' } };

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/incidents/webhooks/pagerduty',
      headers: pagerDutyWebhookHeaders('wrong_secret', payload),
      payload
    });

    expect(response.statusCode).toBe(403);
    expect(incidentRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects replayed PagerDuty webhook signatures older than five minutes', async () => {
    process.env.PAGERDUTY_WEBHOOK_SECRET = 'pd_secret';
    const incidentRecord = delegate();
    const prisma = { incidentRecord };
    const app = await buildApp(prisma);
    const payload = { incident: { id: 'pd_001', title: 'Carrier API outage' } };
    const oldTimestamp = String(Date.now() - 6 * 60 * 1000);

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/incidents/webhooks/pagerduty',
      headers: pagerDutyWebhookHeaders('pd_secret', payload, oldTimestamp),
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Webhook timestamp too old' });
    expect(incidentRecord.upsert).not.toHaveBeenCalled();
  });

  it('blocks erasure DSAR delivery while a legal hold is active', async () => {
    currentPermissions = ['trust.compliance.dsar.write'];
    const prisma = {
      dSARRequest: delegate({ findUnique: vi.fn(async () => ({ id: 'dsar_001', tenantId: 'tenant_001', requestType: 'ERASURE' })) }),
      legalHold: delegate({ findFirst: vi.fn(async () => ({ id: 'hold_001', tenantId: 'tenant_001', status: 'ACTIVE' })) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/compliance/dsar/dsar_001/deliver', payload: { reason: 'deliver' } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'LEGAL_HOLD_ACTIVE', tenantId: 'tenant_001', holdId: 'hold_001' });
  });

  it('records DSAR state transitions and queues export evidence', async () => {
    currentPermissions = ['trust.compliance.dsar.write'];
    const dSARRequest = delegate({
      findUnique: vi.fn(async () => ({ id: 'dsar_001', tenantId: 'tenant_001', status: 'RECEIVED', requestType: 'ACCESS' })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'dsar_001', tenantId: 'tenant_001', ...data }))
    });
    const dSARTransition = delegate();
    const complianceExport = delegate();
    const prisma = { dSARRequest, dSARTransition, complianceExport };
    const app = await buildApp(prisma);

    const transition = await app.inject({
      method: 'PATCH',
      url: '/api/internal/compliance/dsar/dsar_001',
      payload: { status: 'IDENTITY_VERIFIED', notes: 'identity verified' }
    });

    expect(transition.statusCode).toBe(200);
    expect(dSARTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dsarId: 'dsar_001',
        fromStatus: 'RECEIVED',
        toStatus: 'IDENTITY_VERIFIED',
        actorId: 'staff_001'
      })
    });

    const gather = await app.inject({ method: 'POST', url: '/api/internal/compliance/dsar/dsar_001/gather' });

    expect(gather.statusCode).toBe(202);
    expect(complianceExport.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_001',
        dsarId: 'dsar_001',
        exportType: 'DSAR_BUNDLE',
        status: 'QUEUED',
        requestedBy: 'staff_001'
      })
    }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'compliance.dsar.transition' }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'compliance.dsar.gather' }));
  });

  it('requires senior compliance approval for PEP KYC approvals', async () => {
    currentPermissions = ['trust.kyc.approve'];
    currentRoles = ['FINANCE_ADMIN'];
    const prisma = {
      kYCReview: delegate({ findUnique: vi.fn(async () => ({ id: 'kyc_001', tenantId: 'tenant_001' })) }),
      sanctionsScreening: delegate({ findFirst: vi.fn(async () => ({ id: 'pep_001', matchType: 'PEP', status: 'MATCH' })) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/kyc/inquiries/kyc_001/decision', payload: { decision: 'approve' } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'PEP match requires senior compliance approval', requiredRole: 'COMPLIANCE_ADMIN' });
  });

  it('persists signed Persona webhook events with verification metadata', async () => {
    process.env.PERSONA_WEBHOOK_SECRET = 'persona_secret';
    const kYCReview = delegate();
    const prisma = { kYCReview };
    const app = await buildApp(prisma);
    const payload = { data: { id: 'inq_001', attributes: { 'reference-id': 'tenant_001', status: 'completed' } } };

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/kyc/webhooks/persona',
      headers: personaWebhookHeaders('persona_secret', payload),
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(kYCReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_001',
        inquiryId: 'inq_001',
        payload: expect.objectContaining({ _webhookVerification: expect.any(Object) })
      })
    }));
  });

  it('persists signed ComplyAdvantage webhook events with verification metadata', async () => {
    process.env.COMPLYADVANTAGE_WEBHOOK_SECRET = Buffer.from('comply_secret').toString('base64');
    const sanctionsScreening = delegate();
    const prisma = { sanctionsScreening, tenant: { update: vi.fn(async () => undefined) } };
    const app = await buildApp(prisma);
    const payload = { client_ref: 'tenant_001', status: 'CLEAR', matchType: '' };

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/kyc/webhooks/complyadvantage',
      headers: complyAdvantageWebhookHeaders('comply_secret', payload),
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(sanctionsScreening.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_001',
        provider: 'complyadvantage',
        payload: expect.objectContaining({ _webhookVerification: expect.any(Object) })
      })
    }));
  });

  it('fails vendor mutations with 503 when LaunchDarkly is unconfigured', async () => {
    currentPermissions = ['platform.flags.write'];
    const prisma = {};
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/flags/new-flow/overrides', payload: { tenantId: 'tenant_001', value: true } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'LAUNCHDARKLY_NOT_CONFIGURED' });
  });

  it('rejects secret metadata mutations for read-only secret users', async () => {
    currentPermissions = ['trust.secrets.read'];
    const secretCredential = delegate();
    const prisma = { secretCredential };
    const app = await buildApp(prisma);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/internal/secrets/sec_001',
      payload: { rotationNotes: 'rotate this week' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden', permission: 'trust.secrets.write' });
    expect(secretCredential.update).not.toHaveBeenCalled();
  });

  it('allows secret metadata mutations for trust.secrets.write users', async () => {
    currentPermissions = ['trust.secrets.write'];
    const secretCredential = delegate();
    const prisma = { secretCredential };
    const app = await buildApp(prisma);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/internal/secrets/sec_001',
      payload: { rotationNotes: 'rotate this week', reason: 'routine rotation', value: 'do-not-store-this-secret' }
    });

    expect(response.statusCode).toBe(200);
    expect(secretCredential.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sec_001' },
      data: expect.objectContaining({ rotationNotes: 'rotate this week' })
    }));
    expect(secretCredential.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ value: expect.anything() })
    }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'secrets.metadata.update',
      reason: 'routine rotation'
    }));
  });

  it('writes change-management audit evidence for feature flag overrides', async () => {
    process.env.LAUNCHDARKLY_API_TOKEN = 'ld_test_token';
    currentPermissions = ['platform.flags.write'];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'flag_001' }), { status: 200 })));
    const featureFlagOverrideAudit = delegate();
    const prisma = { featureFlagOverrideAudit };
    const app = await buildApp(prisma);

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/flags/new-flow/overrides',
      payload: { tenantId: 'tenant_001', value: true, reason: 'controlled rollout' }
    });

    expect(response.statusCode).toBe(201);
    expect(featureFlagOverrideAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ flagKey: 'new-flow', tenantId: 'tenant_001', value: true, vendorRef: 'launchdarkly' })
    }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'flags.override.set',
      reason: 'controlled rollout'
    }));
  });

  it('persists DocuSign completion webhooks and creates the signed contract', async () => {
    process.env.DOCUSIGN_WEBHOOK_SECRET = 'ds_secret';
    const salesQuote = delegate({
      findFirst: vi.fn(async () => ({ id: 'quote_001', tenantId: 'tenant_001', plan: 'ENTERPRISE', termMonths: 12, customFeatures: ['sso'] })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'quote_001', ...data }))
    });
    const customContract = delegate();
    const prisma = { salesQuote, customContract };
    const app = await buildApp(prisma);

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/contracts/webhooks/docusign',
      headers: docusignWebhookHeaders('ds_secret', { envelopeId: 'env_001', status: 'completed', signedPdfS3Key: 'contracts/quote_001.pdf' }),
      payload: { envelopeId: 'env_001', status: 'completed', signedPdfS3Key: 'contracts/quote_001.pdf' }
    });

    expect(response.statusCode).toBe(200);
    expect(salesQuote.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SIGNED' }) }));
    expect(customContract.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant_001', status: 'ACTIVE', msaUrl: 'contracts/quote_001.pdf' })
    }));
  });

  it.each([
    {
      vendor: 'PagerDuty',
      envName: 'PAGERDUTY_WEBHOOK_SECRET',
      envSecret: 'pd_secret',
      signingSecret: 'pd_secret',
      url: '/api/internal/incidents/webhooks/pagerduty',
      payload: { incident: { id: 'pd_001', title: 'Carrier API outage' } },
      staleTimestamp: () => String(Date.now() - 6 * 60 * 1000),
      headers: pagerDutyWebhookHeaders
    },
    {
      vendor: 'Persona',
      envName: 'PERSONA_WEBHOOK_SECRET',
      envSecret: 'persona_secret',
      signingSecret: 'persona_secret',
      url: '/api/internal/kyc/webhooks/persona',
      payload: { data: { id: 'inq_001', attributes: { 'reference-id': 'tenant_001', status: 'completed' } } },
      staleTimestamp: () => String(Date.now() - 6 * 60 * 1000),
      headers: personaWebhookHeaders
    },
    {
      vendor: 'ComplyAdvantage',
      envName: 'COMPLYADVANTAGE_WEBHOOK_SECRET',
      envSecret: Buffer.from('comply_secret').toString('base64'),
      signingSecret: 'comply_secret',
      url: '/api/internal/kyc/webhooks/complyadvantage',
      payload: { client_ref: 'tenant_001', status: 'CLEAR' },
      staleTimestamp: () => String(Math.floor((Date.now() - 6 * 60 * 1000) / 1000)),
      headers: complyAdvantageWebhookHeaders
    },
    {
      vendor: 'DocuSign',
      envName: 'DOCUSIGN_WEBHOOK_SECRET',
      envSecret: 'ds_secret',
      signingSecret: 'ds_secret',
      url: '/api/internal/contracts/webhooks/docusign',
      payload: { envelopeId: 'env_001', status: 'completed' },
      staleTimestamp: () => String(Date.now() - 6 * 60 * 1000),
      headers: docusignWebhookHeaders
    }
  ])('rejects missing, invalid, and stale $vendor webhook signatures', async ({ envName, envSecret, signingSecret, url, payload, staleTimestamp, headers }) => {
    process.env[envName] = envSecret;
    const app = await buildApp({});

    const missing = await app.inject({ method: 'POST', url, payload });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toEqual({ error: 'Invalid webhook signature' });

    const invalid = await app.inject({
      method: 'POST',
      url,
      headers: headers('wrong_secret', payload),
      payload
    });
    expect(invalid.statusCode).toBe(403);
    expect(invalid.json()).toEqual({ error: 'Invalid webhook signature' });

    const stale = await app.inject({
      method: 'POST',
      url,
      headers: headers(signingSecret, payload, staleTimestamp()),
      payload
    });
    expect(stale.statusCode).toBe(400);
    expect(stale.json()).toEqual({ error: 'Webhook timestamp too old' });
  });

  it('requires two-person approval for commission payouts over GBP 5000', async () => {
    currentPermissions = ['revenue.commissions.payout'];
    currentRoles = ['CFO'];
    const prisma = {
      commissionPayout: delegate({ findUnique: vi.fn(async () => ({ id: 'payout_001', amount: '6000', approvedByFinance: null })) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/commissions/payouts/payout_001/approve', payload: { reason: 'approve' } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'FINANCE_ADMIN approval required before CFO approval', requiredRole: 'FINANCE_ADMIN' });
  });
});
