import { afterEach, describe, expect, it, vi } from 'vitest';

let scheduledProcessor: ((job: { name: string }) => Promise<void>) | null = null;

const scheduledJobsAddMock = vi.fn(async (name: string) => ({ id: `${name}.job`, name }));
const workerOnMock = vi.fn();
const workerCloseMock = vi.fn(async () => undefined);

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_queueName: string, processor: (job: { name: string }) => Promise<void>) => {
    scheduledProcessor = processor;
    return {
      on: workerOnMock,
      close: workerCloseMock
    };
  })
}));

vi.mock('./queues.js', () => ({
  bullmqConnection: {},
  scheduledJobsQueue: {
    add: scheduledJobsAddMock
  }
}));

vi.mock('../modules/finance/finance.routes.js', () => ({
  runOverdueInvoiceSweep: vi.fn(async () => 0)
}));

// ACC-IP-3: the office range is never auto-blocked (config reads the env at import).
process.env.IP_BLOCK_BYPASS_CIDRS = '198.51.100.0/24';
const { startScheduledWorker, stopScheduledWorker } = await import('./scheduled.worker.js');

describe('scheduled security anomaly scan', () => {
  afterEach(async () => {
    await stopScheduledWorker();
    vi.clearAllMocks();
    scheduledProcessor = null;
  });

  it('registers the hourly job and creates anomaly evidence for failed login spikes', async () => {
    const groupBy = vi.fn()
      .mockResolvedValueOnce([
        { staffEmail: 'security@example.com', _count: { id: 6 } },
        { staffEmail: 'noise@example.com', _count: { id: 2 } }
      ])
      .mockResolvedValueOnce([
        { ipAddress: '203.0.113.10', _count: { id: 7 } },
        { ipAddress: '203.0.113.11', _count: { id: 1 } },
        { ipAddress: '198.51.100.7', _count: { id: 9 } }
      ]);
    const securityAnomalyCreate = vi.fn(async () => ({ id: 'anom_001' }));
    const ipBlockFindUnique = vi.fn(async () => null);
    const ipBlockCreate = vi.fn(async (_args: { data: { ipAddress: string; scope: string; reason: string; createdBy: string; expiresAt: Date } }) => ({ id: 'blk_1', ipAddress: '203.0.113.10' }));
    const scheduledJobRunCreate = vi.fn(async () => ({ id: 'run_1' }));
    const scheduledJobRunUpdate = vi.fn(async () => ({ id: 'run_1' }));
    const app = {
      prisma: {
        staffLoginAttempt: { groupBy },
        securityAnomaly: { create: securityAnomalyCreate },
        ipBlock: { findUnique: ipBlockFindUnique, create: ipBlockCreate, update: vi.fn() },
        scheduledJobRun: { create: scheduledJobRunCreate, update: scheduledJobRunUpdate }
      },
      redis: { publish: vi.fn(async () => 1) },
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    };

    await startScheduledWorker(app as never);

    expect(scheduledJobsAddMock).toHaveBeenCalledWith(
      'trust.security-anomaly-scan',
      {},
      expect.objectContaining({
        jobId: 'trust.security-anomaly-scan.hourly',
        repeat: expect.objectContaining({ pattern: '15 * * * *', tz: 'UTC' })
      })
    );

    await scheduledProcessor?.({ name: 'trust.security-anomaly-scan' });

    expect(securityAnomalyCreate).toHaveBeenCalledWith({
      data: {
        anomalyType: 'failed_login_spike',
        severity: 'HIGH',
        status: 'OPEN',
        payload: { staffEmail: 'security@example.com', count: 6 }
      }
    });
    // WP-3.8: the run is recorded with its result.
    expect(scheduledJobRunCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobName: 'trust.security-anomaly-scan', status: 'RUNNING', triggeredBy: 'SCHEDULE' }) }));
    expect(scheduledJobRunUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run_1' }, data: expect.objectContaining({ status: 'SUCCEEDED', result: { accountsChecked: 2, anomalies: 1, ipsBlocked: 1, ipsBypassed: 1 } }) }));
    // WP-5.4: auto-blocks cover every surface (scope ALL) and expire after 24 h; the bypass address is never blocked.
    expect(ipBlockCreate).toHaveBeenCalledTimes(1);
    const created = ipBlockCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({ ipAddress: '203.0.113.10', scope: 'ALL', reason: 'Failed login spike', createdBy: 'trust.security-anomaly-scan' });
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);
  });
});
