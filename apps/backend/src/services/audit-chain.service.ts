import type { FastifyInstance } from 'fastify';
import type { ScheduledJobDefinition } from '../queues/scheduled-job-runner.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyStaff } from './platform-notifier.service.js';
import { verifyPlatformAuditChain } from './platform-audit.service.js';

// trust.audit (WP-5.1, P3-6): the nightly chain verification. Each run is a ScheduledJobRun whose `result` is the
// verifier's answer; a broken chain raises one CRITICAL activity per broken seq and notifies every trust.audit.read holder.

export const AUDIT_CHAIN_VERIFY_JOB = 'trust.audit-chain-verify';
const LINK = '/trust/audit/integrity';

export async function runAuditChainVerification(app: FastifyInstance) {
  const result = await verifyPlatformAuditChain(app.prisma);
  if (!result.ok) {
    const where = `seq ${result.firstBrokenSeq ?? 'unknown'}`;
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'trust.audit',
        type: 'audit.chain_broken',
        ...SYSTEM_ACTOR,
        subjectType: 'audit_log',
        subjectId: String(result.firstBrokenSeq ?? 'unknown'),
        summary: `Audit chain verification failed at ${where} (${result.reason ?? 'unknown reason'})`,
        severity: 'CRITICAL',
        consoleLink: LINK,
        metadata: { firstBrokenSeq: result.firstBrokenSeq ?? null, firstBrokenId: result.firstBrokenId ?? null, reason: result.reason ?? null, checked: result.checked },
        dedupeKey: `audit.chain_broken:${result.firstBrokenSeq ?? 'unknown'}`
      }
    );
    await notifyStaff(app, {
      permission: 'trust.audit.read',
      event: 'audit.chain_broken',
      title: 'Audit chain verification failed',
      body: `The platform audit hash chain breaks at ${where} (${result.reason ?? 'unknown reason'}).`,
      link: LINK,
      severity: 'CRITICAL'
    });
  }
  return {
    ok: result.ok,
    checked: result.checked,
    legacy: result.legacy,
    lastSeq: result.lastSeq,
    cutoverSeq: result.cutoverSeq,
    firstBrokenSeq: result.firstBrokenSeq ?? null,
    firstBrokenId: result.firstBrokenId ?? null,
    reason: result.reason ?? null
  };
}

export const auditChainVerifyJob: ScheduledJobDefinition = {
  name: AUDIT_CHAIN_VERIFY_JOB,
  pattern: '45 3 * * *',
  repeatJobId: 'trust.audit-chain-verify.nightly',
  description: 'Walks the platform audit hash chain by seq; a break raises a CRITICAL activity and notifies trust.audit.read holders.',
  timeoutMs: 30 * 60_000,
  handler: runAuditChainVerification
};
