import { expect, test } from '@playwright/test';

import { mockConsoleSession } from './support/console-session';

const permissions = [
  'platform.tenants.read',
  'platform.health.read',
  'platform.queues.read',
  'platform.impersonation.start',
  'revenue.analytics.read'
];

const redirects = [
  { from: '/admin', to: '/' },
  { from: '/admin/tenants', to: '/platform/tenants' },
  { from: '/admin/tenants/tenant_001', to: '/platform/tenants/tenant_001' },
  { from: '/admin/revenue', to: '/revenue/analytics' },
  { from: '/admin/system', to: '/platform/health' },
  { from: '/admin/queues', to: '/platform/queues' },
  { from: '/admin/impersonation', to: '/platform/impersonation' }
];

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: 'fw_platform_csrf',
      value: 'test-csrf',
      domain: '127.0.0.1',
      path: '/'
    }
  ]);

  await mockConsoleSession(page, permissions);
});

for (const redirect of redirects) {
  test(`${redirect.from} redirects to ${redirect.to}`, async ({ page }) => {
    await page.goto(redirect.from);
    await expect(page).toHaveURL(new RegExp(`${redirect.to.replaceAll('/', '\\/')}$`));
  });
}
