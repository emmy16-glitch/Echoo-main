import { test, expect } from 'playwright/test';

test('guests open Echoo into Discover and are prompted only for a follow action', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/listen$/);
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await expect(page.getByText('Sign in only when you want to save, follow, or join the conversation.')).toBeVisible();

  await page.goto('/listen/stations');
  await expect(page.getByRole('heading', { name: 'Channels', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Follow', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Follow your favourite creators' })).toBeVisible();
  const gate = page.getByRole('dialog');
  await expect(gate.getByRole('button', { name: 'Sign up' })).toBeVisible();
  await expect(gate.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('guest session keeps listening-only state locally', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('echooGuestSessionV1') || 'null');
    return Boolean(session?.id && session?.createdAt && Array.isArray(session.recentlyPlayed));
  })).toBe(true);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
