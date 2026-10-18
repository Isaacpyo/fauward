import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  plan: string;
  /** Override-aware plan (WP-1.4); absent for system contexts or when entitlements could not be loaded. */
  effectivePlan?: string;
  /** Feature key → enabled, after plan and feature overrides (WP-1.4). */
  features?: Record<string, boolean>;
  region: string;
  isSuperAdmin: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error('No tenant context - request did not pass through TenantResolver');
  }
  return ctx;
}

export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, fn);
}