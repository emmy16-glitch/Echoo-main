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
    const compactPlayer = page.locator('.echoo-persistent-player');
    await expect(compactPlayer).toBeVisible();
    await expect.poll(() => compactPlayer.evaluate((node) => getComputedStyle(node).transitionProperty)).toContain('transform');
  }

  await page.screenshot({ path: `design-qa-evidence/listener-streaming/${testInfo.project.name}-home.png`, fullPage: false });
});

test('player exposes queue, transcript and share surfaces', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen');
  await page.locator('.layout-player-track').click();
  await expect(page.getByRole('dialog', { name: 'Full player' })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 768) {
    await expect(page.locator('.echoo-persistent-player')).toHaveClass(/echoo-persistent-player--hidden/);
  }
  await page.getByRole('button', { name: /transcript/i }).click();
  await expect(page.getByText(/Transcript availability/i)).toBeVisible();
  await page.getByRole('button', { name: /close full player/i }).click();
  await expect(page.getByRole('dialog', { name: 'Full player' })).toHaveCount(0);
  if ((page.viewportSize()?.width || 0) < 768) {
    await expect(page.locator('.echoo-persistent-player')).not.toHaveClass(/echoo-persistent-player--hidden/);
  }
});

test('mobile full player dismisses with a deliberate downward swipe on its handle', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) >= 768, 'Swipe dismissal is a compact mobile interaction.');
  await page.addInitScript(() => {
    window.__echooVibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => {
        window.__echooVibrations.push(duration);
        return true;
      },
    });
  });
  await authenticate(page);
  await page.goto('/listen');
  await page.locator('.layout-player-track').click();

  const dialog = page.getByRole('dialog', { name: 'Full player' });
  await expect(dialog).toBeVisible();
  const handle = page.locator('.echoo-full-player-swipe-handle');
  await expect(handle).toBeVisible();
  await handle.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 160, clientY: 28 }],
  });
  await handle.dispatchEvent('touchend', {
    changedTouches: [{ identifier: 1, clientX: 162, clientY: 128 }],
  });

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.echoo-persistent-player')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__echooVibrations)).toEqual([10]);
});

test('mobile full player respects disabled haptic feedback after it is changed in settings', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) >= 768, 'Haptic feedback is only used by the compact mobile swipe interaction.');
  let persistedHapticsEnabled = true;
  await page.route('**/api/player/state', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          volume: 0.8,
          isMuted: false,
          hapticsEnabled: persistedHapticsEnabled,
          isShuffled: false,
          repeatMode: 'none',
        },
      }),
    });
  });
  await page.route('**/api/player/preferences', async (route) => {
    const payload = route.request().postDataJSON();
    if (typeof payload?.hapticsEnabled === 'boolean') {
      persistedHapticsEnabled = payload.hapticsEnabled;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { hapticsEnabled: persistedHapticsEnabled } }),
    });
  });
  await page.addInitScript(() => {
    window.__echooVibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => {
        window.__echooVibrations.push(duration);
        return true;
      },
    });
  });
  await authenticate(page);
  await page.goto('/listen/settings');

  const hapticSwitch = page.getByRole('switch', { name: 'Haptic feedback' });
  await expect(hapticSwitch).toHaveAttribute('aria-checked', 'true');
  await hapticSwitch.click();
  await expect(hapticSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('status')).toContainText('Haptic feedback updated');

  await page.goto('/listen');
  await page.locator('.layout-player-track').click();
  const dialog = page.getByRole('dialog', { name: 'Full player' });
  await expect(dialog).toBeVisible();
  const handle = page.locator('.echoo-full-player-swipe-handle');
  await handle.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 160, clientY: 28 }],
  });
  await handle.dispatchEvent('touchend', {
    changedTouches: [{ identifier: 1, clientX: 162, clientY: 128 }],
  });

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.echoo-persistent-player')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__echooVibrations)).toEqual([]);
});

test('history rows show bounded listening progress with exact position context', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen/history');

  const progress = page.getByRole('progressbar', { name: /listening progress/i }).first();
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
  await expect(progress).toHaveAttribute('aria-valuetext', /100% listened\. Left off at \d+(?::\d{2}){1,2} of \d+(?::\d{2}){1,2}/);
  await expect(page.getByText('100% listened').first()).toBeVisible();
  await progress.hover();
  const tooltip = page.locator('.lh-row-progress-tooltip').first();
  await expect(tooltip).toHaveText(/Left off at \d+(?::\d{2}){1,2} of \d+(?::\d{2}){1,2}/);
  await expect(tooltip).toHaveCSS('visibility', 'visible');
  await expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  const trigger = page.locator('.lh-row-info-button').first();
  await trigger.focus();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  await expect(tooltip).toHaveCSS('visibility', 'hidden');
  await expect(trigger).toBeFocused();

  if ((page.viewportSize()?.width || 0) < 768) {
    const positionToggle = page.locator('.lh-row-position-toggle').first();
    await expect(positionToggle).toBeVisible();
    await expect(positionToggle).toHaveAttribute('aria-expanded', 'false');
    await positionToggle.click();
    await expect(positionToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(tooltip).toHaveAttribute('aria-hidden', 'false');
    await expect(tooltip).toHaveCSS('visibility', 'visible');
    await expect(page.getByRole('dialog', { name: 'Full player' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(positionToggle).toBeFocused();
    await expect(positionToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(tooltip).toHaveAttribute('aria-hidden', 'true');
    await expect(tooltip).toHaveCSS('visibility', 'hidden');
    await positionToggle.click();
    await expect(positionToggle).toHaveAttribute('aria-expanded', 'true');
    await positionToggle.click();
    await expect(positionToggle).toHaveAttribute('aria-expanded', 'false');
  }
});
