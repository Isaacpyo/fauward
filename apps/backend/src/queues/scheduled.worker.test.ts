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
        { ipAddress: '203.0.113.11', _count: { id: 1 } }
      ]);
    const securityAnomalyCreate = vi.fn(async () => ({ id: 'anom_001' }));
    const ipBlockUpsert = vi.fn(async () => ({ ipAddress: '203.0.113.10' }));
    const app = {
      prisma: {
        staffLoginAttempt: { groupBy },
        securityAnomaly: { create: securityAnomalyCreate },
        ipBlock: { upsert: ipBlockUpsert }
      },
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
    expect(ipBlockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ipAddress: '203.0.113.10' },
      create: expect.objectContaining({
        ipAddress: '203.0.113.10',
        reason: 'Failed login spike',
        createdBy: 'trust.security-anomaly-scan'
      })
    }));
  });
});
