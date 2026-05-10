import { expect, test } from '@playwright/test';

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
      domain: 'localhost',
      path: '/'
    }
  ]);

  await page.route('**/api/v1/platform/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'staff_001',
          email: 'staff@fauward.com',
          name: 'Staff User',
          role: 'SUPER_ADMIN',
          permissions
        }
      })
    });
  });
});

for (const redirect of redirects) {
  test(`${redirect.from} redirects to ${redirect.to}`, async ({ page }) => {
    await page.goto(redirect.from);
    await expect(page).toHaveURL(new RegExp(`${redirect.to.replaceAll('/', '\\/')}$`));
  });
}
