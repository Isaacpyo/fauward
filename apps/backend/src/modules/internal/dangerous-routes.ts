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
  // platform.tenants (WP-1.1 move; WP-1.2 adds close and feature overrides)
  { method: 'POST', url: '/api/internal/tenants/:id/suspend' },
  { method: 'POST', url: '/api/internal/tenants/:id/unsuspend' },
  { method: 'POST', url: '/api/internal/tenants/:id/plan-overrides' },
  { method: 'DELETE', url: '/api/internal/tenants/:id/plan-overrides/:overrideId' },
  { method: 'POST', url: '/api/internal/tenants/region-requests/:id/decision' },
  { method: 'POST', url: '/api/internal/tenants/:id/feature-overrides' },
  { method: 'PATCH', url: '/api/internal/tenants/:id/limits' },
  { method: 'POST', url: '/api/internal/tenants/:id/close' },
  { method: 'DELETE', url: '/api/internal/tenants/:id/feature-overrides/:overrideId' },
  // platform.flags (WP-1.4 native overrides)
  { method: 'POST', url: '/api/internal/flags/:key/overrides' },
  { method: 'DELETE', url: '/api/internal/flags/:key/overrides/:id' },
  // platform.impersonation (WP-1.1 move)
  { method: 'POST', url: '/api/internal/impersonation/sessions' },
  // trust.jit (WP-1.7)
  { method: 'POST', url: '/api/internal/jit/requests/:id/approve' },
  // revenue.billing (WP-0.6, WP-1.5)
  { method: 'POST', url: '/api/internal/billing/invoices/:id/void' },
  { method: 'POST', url: '/api/internal/billing/payments' },
  { method: 'POST', url: '/api/internal/billing/credit-notes' },
  { method: 'POST', url: '/api/internal/billing/refunds' },
  { method: 'POST', url: '/api/internal/billing/refunds/:id/approve' },
  { method: 'POST', url: '/api/internal/billing/refunds/:id/reject' }
] as const;

export type DangerousRoute = (typeof DANGEROUS_ROUTES)[number];
