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
  // L16 AI limit (WP-2.10), L9 API key revoke (WP-2.13)
  { method: 'PUT', url: '/api/internal/tenants/:id/ai-limit' },
  { method: 'POST', url: '/api/internal/tenants/:id/api-keys/:keyId/revoke' },
  // L13 user lock (WP-2.15)
  { method: 'POST', url: '/api/internal/tenants/:id/users/:userId/lock' },
  { method: 'POST', url: '/api/internal/tenants/:id/users/:userId/unlock' },
  // platform.queues (WP-3.6)
  { method: 'POST', url: '/api/internal/queues/:name/dlq/replay' },
  { method: 'POST', url: '/api/internal/queues/:name/clean' },
  { method: 'POST', url: '/api/internal/queues/:name/pause' },
  { method: 'POST', url: '/api/internal/queues/:name/resume' },
  // platform.jobs (WP-3.8)
  { method: 'POST', url: '/api/internal/jobs/:name/trigger' },
  // platform.integrations: webhook replay (WP-2.13)
  { method: 'POST', url: '/api/internal/integrations/webhooks/deliveries/:id/replay' },
  // platform.flags (WP-1.4 native overrides)
  { method: 'POST', url: '/api/internal/flags/:key/overrides' },
  { method: 'DELETE', url: '/api/internal/flags/:key/overrides/:id' },
  // platform.impersonation (WP-1.1 move)
  { method: 'POST', url: '/api/internal/impersonation/sessions' },
  // trust.jit (WP-1.7)
  { method: 'POST', url: '/api/internal/jit/requests/:id/approve' },
  // trust.safety (WP-2.4)
  { method: 'POST', url: '/api/internal/safety/signals/:id/decision' },
  { method: 'POST', url: '/api/internal/safety/suspensions/:id/lift' },
  { method: 'POST', url: '/api/internal/safety/appeals/:id/decision' },
  // revenue.subscriptions + save offers (WP-2.7)
  { method: 'POST', url: '/api/internal/subscriptions/plan-change-requests/:id/decision' },
  { method: 'POST', url: '/api/internal/subscriptions/:tenantId/cancel' },
  { method: 'POST', url: '/api/internal/subscriptions/overrides' },
  { method: 'POST', url: '/api/internal/dunning/save-offers/:id/approve' },
  // revenue.dunning enrolments (WP-4.5)
  { method: 'POST', url: '/api/internal/dunning/enrollments/:id/retry' },
  { method: 'POST', url: '/api/internal/dunning/enrollments/:id/pause' },
  { method: 'POST', url: '/api/internal/dunning/enrollments/:id/resume' },
  { method: 'POST', url: '/api/internal/dunning/enrollments/:id/cancel' },
  // trust.compliance (WP-2.5)
  { method: 'POST', url: '/api/internal/compliance/dsar/:id/deliver' },
  { method: 'POST', url: '/api/internal/compliance/dsar/:id/erase' },
  { method: 'POST', url: '/api/internal/compliance/legal-holds' },
  { method: 'POST', url: '/api/internal/compliance/legal-holds/:id/release' },
  // customer.comms (WP-2.14): delete only before any receipt
  { method: 'DELETE', url: '/api/internal/announcements/:id' },
  // gtm.demos (WP-4.15)
  { method: 'DELETE', url: '/api/internal/demos/:id' },
  // gtm.trials (WP-4.14)
  { method: 'POST', url: '/api/internal/trials/extensions/:id/decision' },
  { method: 'POST', url: '/api/internal/trials/:tenantId/extend' },
  // trust.security (WP-4.11)
  { method: 'POST', url: '/api/internal/security/ip-blocks' },
  { method: 'DELETE', url: '/api/internal/security/ip-blocks/:id' },
  { method: 'POST', url: '/api/internal/security/sessions/:id/revoke' },
  // trust.kyc (WP-4.10)
  { method: 'POST', url: '/api/internal/kyc/reviews/:id/decision' },
  { method: 'POST', url: '/api/internal/kyc/screenings/:id/decision' },
  // revenue.tax (WP-4.7)
  { method: 'POST', url: '/api/internal/tax/exemptions/:id/decision' },
  // revenue.disputes (WP-4.6)
  { method: 'POST', url: '/api/internal/disputes/:id/evidence' },
  // trust.secrets (WP-4.12)
  { method: 'POST', url: '/api/internal/secrets/:id/mark-rotated' },
  // trust.audit (WP-1.9)
  { method: 'POST', url: '/api/internal/audit/export' },
  // revenue.billing (WP-0.6, WP-1.5)
  { method: 'POST', url: '/api/internal/billing/invoices/:id/void' },
  { method: 'POST', url: '/api/internal/billing/payments' },
  { method: 'POST', url: '/api/internal/billing/credit-notes' },
  { method: 'POST', url: '/api/internal/billing/refunds' },
  { method: 'POST', url: '/api/internal/billing/refunds/:id/approve' },
  { method: 'POST', url: '/api/internal/billing/refunds/:id/reject' }
] as const;

export type DangerousRoute = (typeof DANGEROUS_ROUTES)[number];
