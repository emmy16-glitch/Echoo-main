import { test, expect } from 'playwright/test';

test('onboarding uses a contextual hero and finishes with a public creator profile preview', async ({ page }, testInfo) => {
  await page.goto('/');

  await page.getByLabel('Full name').fill('New Echoo Creator');
  await page.getByLabel('Username').fill('new-creator');
  await page.getByLabel('Email address').fill('new-creator@example.test');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm password').fill('password123');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
  await expect(page.locator('.eor-hero-copy h1')).toContainText('Your identity.');
  await expect(page.locator('.eor-profile-hero-card')).toBeVisible();

  await page.getByLabel('Display name').fill('New Echoo Creator');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: /Choose how you'll use Echoo/i })).toBeVisible();
  await expect(page.locator('.eor-hero-copy h1')).toContainText('Your platform.');
  await expect(page.locator('.eor-role-hero-card img')).toBeVisible();

  const creatorRole = page.locator('.eor-role-card').filter({
    has: page.getByRole('heading', { name: 'Creator', exact: true }),
  });
  await creatorRole.click();
  await expect(creatorRole).toHaveClass(/selected/);
  await expect(creatorRole).toHaveCSS('border-color', 'rgb(19, 107, 213)');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: /How will you create/i })).toBeVisible();
  await expect(page.locator('.eor-hero-copy h1')).toContainText('creator identity.');
  await expect(page.locator('.eor-creator-hero-card')).toBeVisible();

  await page.getByRole('radio', { name: /Individual/i }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Category').selectOption('Technology');
  await page.getByLabel('What will you create?').fill('Live technology conversations and community shows.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: /Almost ready/i })).toBeVisible();
  await expect(page.getByLabel('Your public creator profile preview')).toContainText('New Echoo Creator');
  await expect(page.getByLabel('Your public creator profile preview')).toContainText('Technology');
  await expect(page.getByText('0 followers', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create my creator space' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('creator-ready.png'), fullPage: true });
});
