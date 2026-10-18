// Every `D:` route in docs/console-spec/20-service-catalogue.md (architecture §9.2). Each WP adds its rows in the same
// commit; the dangerous-route test asserts each one is registered with requireFreshMfa and a reason guard.
export const DANGEROUS_ROUTES = [
  // trust.iam (WP-0.1, WP-0.4)
  { method: 'POST', url: '/api/internal/iam/users/:id/suspend' },
  { method: 'POST', url: '/api/internal/iam/users/:id/offboard' },
  { method: 'POST', url: '/api/internal/iam/users/:id/reactivate' },
  { method: 'DELETE', url: '/api/internal/iam/users/:id' },
  { method: 'POST', url: '/api/internal/iam/users/:id/mfa/reset' },
  { method: 'POST', url: '/api/internal/iam/role-assignments' },
  { method: 'DELETE', url: '/api/internal/iam/role-assignments/:id' },
  // revenue.billing (WP-0.6)
  { method: 'POST', url: '/api/internal/billing/refunds' },
  { method: 'POST', url: '/api/internal/billing/refunds/:id/approve' },
  { method: 'POST', url: '/api/internal/billing/refunds/:id/reject' }
] as const;

export type DangerousRoute = (typeof DANGEROUS_ROUTES)[number];
