import { expect, test } from '@playwright/test';

const required = [
  'CUSTOM_DOMAIN_E2E_BASE_URL',
  'CUSTOM_DOMAIN_E2E_EMAIL',
  'CUSTOM_DOMAIN_E2E_PASSWORD',
  'CUSTOM_DOMAIN_E2E_DOMAIN',
  'CUSTOM_DOMAIN_E2E_EXPECTED_SLUG'
];

test.describe('custom domain staging flow', () => {
test.skip(required.some((key) => !process.env[key]), 'Set CUSTOM_DOMAIN_E2E_* env vars to run staging custom-domain E2E');

test('Pro tenant adds and verifies custom domain on staging', async ({ page, request }) => {
  const baseUrl = process.env.CUSTOM_DOMAIN_E2E_BASE_URL!;
  const email = process.env.CUSTOM_DOMAIN_E2E_EMAIL!;
  const password = process.env.CUSTOM_DOMAIN_E2E_PASSWORD!;
  const domain = process.env.CUSTOM_DOMAIN_E2E_DOMAIN!;
  const expectedSlug = process.env.CUSTOM_DOMAIN_E2E_EXPECTED_SLUG!;

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  await page.goto(`${baseUrl}/settings?tab=domain`);
  await page.getByLabel('Custom domain').fill(domain);
  await page.getByRole('button', { name: 'Add domain' }).click();
  await expect(page.getByText('CNAME')).toBeVisible();
  await expect(page.getByTestId('domain-status-badge')).toHaveText(/Pending DNS|Verifying SSL|Live/i);
  await expect(page.getByTestId('domain-status-badge')).toHaveText(/Live/i, { timeout: 120_000 });

  const response = await request.get(`https://${domain}/api/v1/tenant/me`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.slug).toBe(expectedSlug);

  await page.getByRole('button', { name: 'Remove domain' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Add a custom domain')).toBeVisible();
});
});
