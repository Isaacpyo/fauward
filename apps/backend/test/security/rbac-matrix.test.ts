import { describe, expect, it } from 'vitest';
import { roleHasPermission, Role, type Permission } from '@fauward/internal-rbac';

const routePermissions = [
  ['GET /api/internal/iam/users', 'trust.iam.read'],
  ['POST /api/internal/iam/users', 'trust.iam.write'],
  ['GET /api/internal/audit/entries', 'trust.audit.read'],
  ['POST /api/internal/audit/export', 'trust.audit.export'],
  ['GET /api/internal/billing/invoices', 'revenue.invoices.read'],
  ['POST /api/internal/billing/invoices', 'revenue.invoices.write'],
  ['POST /api/internal/billing/refunds', 'revenue.invoices.refund'],
  ['POST /api/internal/billing/refunds large', 'revenue.invoices.refund.large'],
  ['GET /api/internal/customer/360/:tenantId', 'customer.360.read'],
  ['PATCH /api/internal/customer/360/:tenantId/notes', 'customer.success.write']
] as const satisfies ReadonlyArray<readonly [string, Permission]>;

const roleMatrix: Record<Role, Permission[]> = {
  [Role.ROOT]: routePermissions.map(([, permission]) => permission),
  [Role.FINANCE_ADMIN]: [
    'revenue.invoices.read',
    'revenue.invoices.write',
    'revenue.invoices.refund',
    'revenue.invoices.refund.large'
  ],
  [Role.SUPPORT_AGENT]: ['customer.360.read'],
  [Role.COMPLIANCE_ADMIN]: ['trust.iam.read', 'trust.iam.write', 'trust.audit.read', 'trust.audit.export'],
  [Role.EXECUTIVE]: ['trust.iam.read', 'trust.audit.read', 'revenue.invoices.read', 'customer.360.read']
} as Record<Role, Permission[]>;

describe('internal route RBAC matrix', () => {
  for (const [role, expectedPermissions] of Object.entries(roleMatrix) as Array<[Role, Permission[]]>) {
    for (const [route, permission] of routePermissions) {
      it(`${role} ${expectedPermissions.includes(permission) ? 'can access' : 'cannot access'} ${route}`, () => {
        expect(roleHasPermission(role, permission)).toBe(expectedPermissions.includes(permission));
      });
    }
  }
});
