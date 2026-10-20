import type { FastifyInstance } from 'fastify';
import { registerConsoleAuthRoutes } from './auth/console-auth.routes.js';
import { registerInternalIamRoutes } from './iam.routes.js';
import { registerInternalAuditRoutes } from './audit.routes.js';
import { registerInternalBillingRoutes } from './billing.routes.js';
import { registerCustomer360Routes } from './customer/customer360.routes.js';
import { registerInternalConsolePhaseRoutes } from './console-phases.routes.js';
import { registerStaffNotificationRoutes } from './shell/notifications.routes.js';
import { registerConsoleMetricsRoutes } from './shell/metrics.routes.js';
import { registerConsoleSearchRoutes } from './shell/search.routes.js';
import { registerConsoleTenantRoutes } from './platform/tenants.routes.js';
import { registerConsoleImpersonationRoutes } from './platform/impersonation.routes.js';
import { registerConsoleOperationsRoutes } from './platform/operations.routes.js';
import { registerConsoleCommsRoutes } from './customer/comms.routes.js';
import { registerMonitoringRoutes } from './monitoring.routes.js';
import { registerJitRoutes } from './trust/jit.routes.js';

/**
 * Every console endpoint lives under /api/internal (D2). This is the only console registration call in app.ts; the
 * registered routes are listed in route-index.ts (checked by routes/internal/rbac-matrix.test.ts).
 */
export async function registerConsoleRoutes(app: FastifyInstance) {
  await registerConsoleAuthRoutes(app);
  await registerConsoleTenantRoutes(app);
  await registerConsoleImpersonationRoutes(app);
  await registerConsoleOperationsRoutes(app);
  await registerConsoleMetricsRoutes(app);
  await registerConsoleSearchRoutes(app);
  await registerConsoleCommsRoutes(app);
  await registerInternalIamRoutes(app);
  await registerInternalAuditRoutes(app);
  await registerJitRoutes(app);
  await registerInternalBillingRoutes(app);
  await registerCustomer360Routes(app);
  await registerInternalConsolePhaseRoutes(app);
  await registerStaffNotificationRoutes(app);
  await registerMonitoringRoutes(app);
}
