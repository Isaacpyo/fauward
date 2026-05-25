import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdd = vi.fn();

vi.mock('../../queues/queues.js', () => ({
  agentQueue: { add: (...args: any[]) => mockAdd(...args) }
}));

beforeEach(() => {
  mockAdd.mockClear();
});

import { enqueueAgentEvent } from './agent.queue.js';

describe('enqueueAgentEvent', () => {
  it('enqueues a job with correct data and stable jobId', async () => {
    mockAdd.mockResolvedValueOnce({ id: 'job-1' });

    const app = {
      log: { info: vi.fn(), warn: vi.fn() }
    } as any;

    const event = {
      eventId: 'failed-delivery-ship-abc-event-123',
      type: 'failed_delivery' as const,
      tenantId: 'tenant-1',
      shipmentId: 'ship-abc',
      payload: { reason: 'customer not home' }
    };

    await enqueueAgentEvent(app, event);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'failed_delivery',
      event,
      { jobId: 'failed-delivery-ship-abc-event-123' }
    );
    expect(app.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.eventId, type: event.type }),
      'agent event enqueued'
    );
  });

  it('swallows enqueue errors and logs a warning without throwing', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Redis down'));

    const app = {
      log: { info: vi.fn(), warn: vi.fn() }
    } as any;

    const event = {
      eventId: 'evt-1',
      type: 'failed_delivery' as const,
      tenantId: 'tenant-1',
      shipmentId: 'ship-1'
    };

    await expect(enqueueAgentEvent(app, event)).resolves.toBeUndefined();
    expect(app.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.eventId }),
      'agent event enqueue failed'
    );
  });

  it('deduplicates via jobId when called twice with the same eventId', async () => {
    mockAdd.mockResolvedValueOnce({ id: 'job-1' });

    const app = {
      log: { info: vi.fn(), warn: vi.fn() }
    } as any;

    const event = {
      eventId: 'duplicate-evt',
      type: 'failed_delivery' as const,
      tenantId: 'tenant-1',
      shipmentId: 'ship-1'
    };

    await enqueueAgentEvent(app, event);
    await enqueueAgentEvent(app, event);

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenNthCalledWith(
      1,
      'failed_delivery',
      event,
      { jobId: 'duplicate-evt' }
    );
    expect(mockAdd).toHaveBeenNthCalledWith(
      2,
      'failed_delivery',
      event,
      { jobId: 'duplicate-evt' }
    );
  });
});
