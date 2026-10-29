import { test, expect } from 'playwright/test';

// Simulated browser lifecycle audit for background live playback. Playwright
// cannot prove audio continues on a locked phone; these assertions cover the
// deterministic parts of the contract: lifecycle events must reconcile the
// player without duplicating audio elements, without destroying the mounted
// session on navigation, and without falsifying a playing state the browser
// never confirmed.
const broadcastId = '507f1f77bcf86cd799439031';

const authenticate = (page) => page.addInitScript(() => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('user', JSON.stringify({
    id: '507f1f77bcf86cd799439012',
    username: 'listener',
    roles: ['listener'],
    userType: 'listener',
    onboardingCompleted: true,
    profileCompleted: true,
  }));
  localStorage.setItem('echooRole', 'listener');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
});

const lifecycleAudit = (page) => page.evaluate(async () => {
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('offline'));
  window.dispatchEvent(new Event('online'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  window.dispatchEvent(new Event('pageshow'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  document.dispatchEvent(new Event('visibilitychange'));
});

const listenerNav = (page, label) => page.evaluate((destination) => {
  const button = [...document.querySelectorAll('.listener-v2-mobile-nav button, .listener-v2-nav button')]
    .find((candidate) => candidate.textContent === destination);
  button.click();
}, label);

test('live shows exactly one player and background events cannot fake listening', async ({ page }) => {
  await authenticate(page);
  await page.goto(`/listen/live/${broadcastId}`);
  const player = page.locator('.echoo-livekit-listener');
  await expect(player).toHaveCount(1);

  // The audio host must carry zero duplicated audio elements and the player
  // must never be marked listening without a browser-confirmed playing state.
  const unawareOfPlayingState = async () => {
    const audios = await page.locator('.echoo-livekit-listener .echoo-livekit-audio-host > audio').count();
    const classes = (await player.getAttribute('class')) || '';
    return audios === 0 && !classes.split(' ').includes('listening');
  };
  await expect.poll(unawareOfPlayingState, { timeout: 5_000 }).toBe(true);

  await lifecycleAudit(page);
  await expect(player).toHaveCount(1);
  await expect.poll(unawareOfPlayingState).toBe(true);

  await expect(player).toHaveCount(1);
  await expect.poll(unawareOfPlayingState).toBe(true);
});

test('navigation during a live session keeps a single persistent player and mini player', async ({ page }) => {
  await authenticate(page);
  await page.goto(`/listen/live/${broadcastId}`);
  const player = page.locator('.echoo-livekit-listener');
  await expect(player).toHaveCount(1);

  await page.locator('.listener-v2-room-toolbar button').first().click();
  const mini = page.locator('.listener-v2-live-mini');
  await expect(mini).toBeVisible();
  await expect(player).toHaveCount(1);

  // Visiting unrelated listener routes keeps the same session mounted.
  await listenerNav(page, 'Library');
  await expect(page).toHaveURL(/\/listen\/library$/);
  await expect(mini).toBeVisible();
  await expect(player).toHaveCount(1);

  // A lifecycle wake while away must not destroy or duplicate the session.
  await lifecycleAudit(page);
  await expect(player).toHaveCount(1);
  await expect(mini).toBeVisible();

  // Returning to the room never creates a second player or audio connection.
  await page.getByRole('button', { name: 'Open live room' }).click();
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  await expect(player).toHaveCount(1);
  await expect(mini).toHaveCount(0);
});
