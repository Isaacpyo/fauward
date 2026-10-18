import type { PlatformActivity } from '@prisma/client';
import { SERVICE_READ_PERMISSIONS, serviceReadPermission, type ConsoleServiceId } from '@fauward/internal-rbac';
import type { ConsoleRequestContext } from '../middleware/require-console-permission.js';

// Who sees which activity (D7): a row is visible when the caller can read the service it belongs to — the manifest's
// `requiredPermission` — through a role or an unexpired JIT grant. Rows of unknown services are visible to nobody.

type VisibilityContext = Pick<ConsoleRequestContext, 'rolePermissions' | 'jit'>;

export function canSeeService(context: VisibilityContext, service: string, now = new Date()): boolean {
  const permission = serviceReadPermission(service);
  if (!permission) return false;
  if (context.rolePermissions.has(permission)) return true;
  const grant = context.jit.get(permission);
  return Boolean(grant?.expiresAt && grant.expiresAt > now);
}

export function visibleServices(context: VisibilityContext, now = new Date()): ConsoleServiceId[] {
  return (Object.keys(SERVICE_READ_PERMISSIONS) as ConsoleServiceId[]).filter((service) => canSeeService(context, service, now));
}

export type TenantLabel = { id: string; name: string; slug: string };

/** API shape of one activity row; `tenant` feeds TenantChip. */
export function presentActivity(row: PlatformActivity, tenants: ReadonlyMap<string, TenantLabel>) {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    tenantId: row.tenantId,
    tenant: row.tenantId ? tenants.get(row.tenantId) ?? { id: row.tenantId, name: row.tenantId, slug: row.tenantId } : null,
    service: row.service,
    type: row.type,
    actorType: row.actorType,
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    summary: row.summary,
    severity: row.severity,
    consoleLink: row.consoleLink,
    metadata: row.metadata
  };
}

export type PresentedActivity = ReturnType<typeof presentActivity>;
