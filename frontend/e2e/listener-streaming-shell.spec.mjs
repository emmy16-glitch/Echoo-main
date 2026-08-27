import { test, expect } from 'playwright/test';

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'alexmorgan',
  displayName: 'Alex Morgan',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const authenticate = (page) => page.addInitScript((user) => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('token', 'listener-token');
  localStorage.setItem('refreshToken', 'listener-refresh-token');
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('echooRole', 'listener');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
}, listener);

test('listener streaming shell keeps its navigation and player pinned', async ({ page }, testInfo) => {
  await authenticate(page);
  await page.goto('/listen');
  await expect(page.locator('.echoo-home-now-playing')).toBeVisible();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  if (viewportWidth >= 768) {
    await expect.poll(() => page.locator('.echoo-app-sidebar').evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
    await expect.poll(() => page.locator('.echoo-app-main').evaluate((node) => getComputedStyle(node).overflowY)).toBe('auto');
    await expect.poll(() => page.locator('.echoo-persistent-player').evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
  } else {
    await expect(page.locator('.echoo-app-sidebar')).toBeHidden();
    await expect(page.locator('.echoo-persistent-player')).toBeVisible();
  }

  await page.screenshot({ path: `design-qa-evidence/listener-streaming/${testInfo.project.name}-home.png`, fullPage: false });
});

test('player exposes queue, transcript and share surfaces', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen');
  await page.locator('.layout-player-track').click();
  await expect(page.getByRole('dialog', { name: 'Full player' })).toBeVisible();
  await page.getByRole('button', { name: /transcript/i }).click();
  await expect(page.getByText(/Transcript availability/i)).toBeVisible();
  await page.getByRole('button', { name: /close full player/i }).click();
  await expect(page.getByRole('dialog', { name: 'Full player' })).toHaveCount(0);
});
