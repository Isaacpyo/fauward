import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';

import { ACTIVE_STATUSES, runDetectors, type Finding } from './sweep.detectors.js';

type ProgressData = {
  stage?: string;
  status?: string;
  scannedCount?: number;
  flaggedCount?: number;
  proposedCount?: number;
  finishedAt?: Date;
  output?: Prisma.InputJsonValue;
};

export async function runSweep(app: FastifyInstance, runId: string, tenantId: string): Promise<void> {
  const prisma = app.prisma as unknown as PrismaClient;

  try {
    await updateRun(app, runId, { stage: 'scanning' });

    // Phase 1: deterministic detectors (no LLM).
    const [findings, scanned] = await Promise.all([
      runDetectors(prisma, tenantId),
      prisma.shipment.count({ where: { tenantId } })
    ]);

    await updateRun(app, runId, {
      stage: 'flagged',
      scannedCount: scanned,
      flaggedCount: findings.length
    });

    if (findings.length === 0) {
      await updateRun(app, runId, {
        stage: 'complete',
        status: 'COMPLETED',
        finishedAt: new Date(),
        output: { findings: [] }
      });
      return;
    }

    await updateRun(app, runId, { stage: 'proposing' });

    // Phase 2: for every finding, (a) record a visible `flag_finding` row, and (b) for
    // actionable kinds, deterministically write a `PENDING_APPROVAL` AgentAction so the admin
    // gets concrete Approve/Reject choices in the Tasks list — no LLM dependency.
    // Approval re-runs evaluatePolicy and executes the existing handler, so the safety gate
    // and audit trail are unchanged.
    let proposed = 0;
    for (const finding of findings) {
      try {
        await prisma.agentAction.create({
          data: {
            tenantId,
            runId,
            type: 'flag_finding',
            payload: finding as unknown as Prisma.InputJsonValue,
            risk: 'auto_approved',
            status: 'AUTO_APPLIED',
            appliedAt: new Date()
          }
        });
        proposed++;

        const proposalWritten = await proposeFix(prisma, tenantId, runId, finding);
        if (proposalWritten) proposed++;
      } catch (err) {
        app.log.warn({ err, runId, kind: finding.kind }, 'sweep finding write failed');
      }
    }

    await updateRun(app, runId, {
      stage: 'complete',
      status: 'COMPLETED',
      proposedCount: proposed,
      finishedAt: new Date(),
      output: { findings: findings.map(summariseFinding) }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.log.error({ err, runId, tenantId }, 'sweep failed');
    await updateRun(app, runId, {
      stage: 'failed',
      status: 'FAILED',
      finishedAt: new Date(),
      output: { error: message }
    }).catch((updateErr) => {
      app.log.error({ updateErr, runId }, 'failed to mark sweep run as FAILED');
    });
    throw err;
  }
}

/**
 * For each actionable finding kind, write a concrete `PENDING_APPROVAL` AgentAction that the
 * admin can Approve or Reject. Returns true when a proposal row was written.
 *
 * Mapping (kept in sync with AGENT_FOUNDATION_NOTES.md):
 *   unassigned       → assign_shipment (best available driver, lightest load)
 *   failed_unhandled → send_customer_notification (template: failed_delivery)
 *   past_deadline    → send_customer_notification (template: delayed)
 *   overloaded_driver, stuck → informational, no proposal
 */
async function proposeFix(
  prisma: PrismaClient,
  tenantId: string,
  runId: string,
  finding: Finding
): Promise<boolean> {
  switch (finding.kind) {
    case 'unassigned': {
      const driver = await pickBestAvailableDriver(prisma, tenantId);
      if (!driver) return false;
      await prisma.agentAction.create({
        data: {
          tenantId,
          runId,
          type: 'assign_shipment',
          payload: {
            shipmentId: finding.shipmentId,
            driverId: driver.id,
            reason: `Sweep: shipment ${finding.trackingNumber} has no driver. Suggested ${driver.name} (currently ${driver.activeJobCount} active jobs).`,
            tenantId
          } as Prisma.InputJsonValue,
          risk: 'requires_approval',
          status: 'PENDING_APPROVAL'
        }
      });
      return true;
    }
    case 'failed_unhandled': {
      await prisma.agentAction.create({
        data: {
          tenantId,
          runId,
          type: 'send_customer_notification',
          payload: {
            shipmentId: finding.shipmentId,
            channel: 'email',
            templateKey: 'failed_delivery',
            customMessage: null,
            tenantId
          } as Prisma.InputJsonValue,
          risk: 'requires_approval',
          status: 'PENDING_APPROVAL'
        }
      });
      return true;
    }
    case 'past_deadline': {
      await prisma.agentAction.create({
        data: {
          tenantId,
          runId,
          type: 'send_customer_notification',
          payload: {
            shipmentId: finding.shipmentId,
            channel: 'email',
            templateKey: 'delayed',
            customMessage: null,
            tenantId
          } as Prisma.InputJsonValue,
          risk: 'requires_approval',
          status: 'PENDING_APPROVAL'
        }
      });
      return true;
    }
    case 'overloaded_driver':
    case 'stuck':
      // Informational — no auto-fix. Surfaces in the Flagged tab via the flag_finding row.
      return false;
  }
}

async function pickBestAvailableDriver(
  prisma: PrismaClient,
  tenantId: string
): Promise<{ id: string; name: string; activeJobCount: number } | null> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId, isAvailable: true },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      _count: { select: { shipments: { where: { status: { in: ACTIVE_STATUSES } } } } }
    }
  });
  if (drivers.length === 0) return null;
  // Lightest load wins; stable secondary order by createdAt for determinism.
  const sorted = [...drivers].sort((a, b) => {
    if (a._count.shipments !== b._count.shipments) return a._count.shipments - b._count.shipments;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const top = sorted[0];
  return {
    id: top.id,
    name: [top.user.firstName, top.user.lastName].filter(Boolean).join(' ') || top.user.email,
    activeJobCount: top._count.shipments
  };
}

async function updateRun(app: FastifyInstance, runId: string, data: ProgressData): Promise<void> {
  await app.prisma.aiAgentRun.update({ where: { id: runId }, data });
}

function summariseFinding(f: Finding): { kind: string; ref: string } {
  switch (f.kind) {
    case 'unassigned':
      return { kind: f.kind, ref: f.trackingNumber };
    case 'overloaded_driver':
      return { kind: f.kind, ref: f.driverName };
    case 'past_deadline':
      return { kind: f.kind, ref: f.trackingNumber };
    case 'failed_unhandled':
      return { kind: f.kind, ref: f.trackingNumber };
    case 'stuck':
      return { kind: f.kind, ref: f.trackingNumber };
  }
}
