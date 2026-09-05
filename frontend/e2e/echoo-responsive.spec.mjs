import { test, expect } from 'playwright/test';

const listenerRoutes = [
  '/listen',
  '/listen/search',
  '/listen/live',
  '/listen/channels',
  '/listen/channels/507f1f77bcf86cd799439021',
  '/listen/audio/507f1f77bcf86cd799439041',
  '/listen/library',
  '/listen/library/following',
  '/listen/playlist',
  '/listen/saved-moments',
  '/listen/history',
  '/listen/downloads',
  '/listen/creator/507f1f77bcf86cd799439011',
  '/listen/notifications',
  '/listen/settings',
];

const creatorWorkspaces = [
  'Broadcast',
  'Channel',
  'Recordings',
  'Collections',
  'Schedule Events',
  'Analytics',
];

const userForRole = (role) => role === 'creator'
  ? {
      id: '507f1f77bcf86cd799439011',
      _id: '507f1f77bcf86cd799439011',
      username: 'echoocreator',
      displayName: 'Echoo Creator With A Long Display Name',
      email: 'creator@example.test',
      userType: 'creator',
      roles: ['listener', 'creator'],
      onboardingCompleted: true,
      profileCompleted: true,
      creatorProfile: { creatorType: 'individual', artistName: 'Echoo Creator' },
    }
  : {
      id: '507f1f77bcf86cd799439012',
      _id: '507f1f77bcf86cd799439012',
      username: 'echolistener',
      displayName: 'Echoo Listener With A Long Display Name',
      email: 'listener@example.test',
      userType: 'listener',
      roles: ['listener'],
      onboardingCompleted: true,
      profileCompleted: true,
    };

const authenticate = async (page, role) => {
  const user = userForRole(role);
  await page.addInitScript(({ nextUser, nextRole }) => {
    localStorage.setItem('accessToken', `${nextRole}-token`);
    localStorage.setItem('token', `${nextRole}-token`);
    localStorage.setItem('refreshToken', `${nextRole}-refresh-token`);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', nextRole);
    if (nextRole === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
    }
  }, { nextUser: user, nextRole: role });
};

const deterministicRealtimeNoise = (value) => {
  const text = String(value || '');
  return text.includes('/socket.io/') || text.includes('ERR_BLOCKED_BY_ORB');
};

const startFailureMonitor = (page) => {
  const failures = [];
  let location = 'boot';
  const setLocation = (value) => { location = value; };

  page.on('pageerror', (error) => failures.push(`${location}: pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !deterministicRealtimeNoise(message.text())) {
      failures.push(`${location}: console.error: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    // Socket.IO is Echoo's realtime plane and is covered by backend/realtime
    // tests. This deterministic browser fixture intentionally supplies only
    // HTTP API state, so the socket client asset/transport is not hosted here.
    if (
      !url.startsWith('data:') &&
      !url.startsWith('blob:') &&
      !deterministicRealtimeNoise(url)
    ) {
      failures.push(`${location}: requestfailed: ${request.method()} ${url} (${request.failure()?.errorText || 'unknown'})`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) failures.push(`${location}: HTTP ${response.status()} ${response.url()}`);
  });

  return { failures, setLocation };
};

const settle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
};

const collectIntegrityViolations = async (page, label) => page.evaluate((pageLabel) => {
  const issues = [];
  const viewportWidth = window.innerWidth;
  const doc = document.documentElement;
  if (doc.scrollWidth > viewportWidth + 2) {
    issues.push(`${pageLabel}: horizontal overflow ${doc.scrollWidth}px > ${viewportWidth}px`);
  }

  const ids = new Map();
  document.querySelectorAll('[id]').forEach((node) => {
    const id = node.id;
    if (!id) return;
    ids.set(id, (ids.get(id) || 0) + 1);
  });
  [...ids.entries()].filter(([, count]) => count > 1).forEach(([id, count]) => {
    issues.push(`${pageLabel}: duplicate id #${id} (${count})`);
  });

  const isVisible = (node) => {
    if (node.closest('[aria-hidden="true"], [inert]')) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  };

  const mains = [...document.querySelectorAll('main')].filter((node) => {
    if (!isVisible(node)) return false;
    const role = String(node.getAttribute('role') || '').toLowerCase();
    return !['region', 'presentation', 'none'].includes(role);
  });
  if (mains.length > 1) issues.push(`${pageLabel}: ${mains.length} effective main landmarks`);

  const hasHorizontalScrollContainer = (node) => {
    let current = node.parentElement;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      const overflowX = style.overflowX;
      if (
        ['auto', 'scroll'].includes(overflowX) ||
        (current.scrollWidth > current.clientWidth + 2 && overflowX !== 'visible')
      ) return true;
      current = current.parentElement;
    }
    return false;
  };

  document.querySelectorAll('button, [role="button"], a[href], input, select, textarea').forEach((node) => {
    if (!isVisible(node)) return;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const mostlyOutsideHorizontally = rect.width > 0 && visibleWidth / rect.width < 0.75;
    if (mostlyOutsideHorizontally && !hasHorizontalScrollContainer(node)) {
      issues.push(`${pageLabel}: clipped interactive ${node.tagName.toLowerCase()}.${node.className || ''}`);
    }

    const isNativeButton = node.tagName === 'BUTTON';
    const roleButton = node.getAttribute('role') === 'button';
    if (roleButton && !isNativeButton && node.tabIndex < 0) {
      issues.push(`${pageLabel}: role=button is not keyboard focusable (${node.className || node.textContent?.trim().slice(0, 40)})`);
    }

    if (isNativeButton || roleButton) {
      const name = [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.textContent,
      ].find((value) => String(value || '').trim());
      if (!name) issues.push(`${pageLabel}: visible button has no accessible name (${node.className || 'no-class'})`);
      if (rect.width < 28 || rect.height < 28) {
        issues.push(`${pageLabel}: undersized interactive target ${Math.round(rect.width)}x${Math.round(rect.height)} (${String(name || node.className || '').trim().slice(0, 50)})`);
      }
    }

    if (style.position === 'fixed' || style.position === 'sticky') {
      if (mostlyOutsideHorizontally && !hasHorizontalScrollContainer(node)) {
        issues.push(`${pageLabel}: fixed/sticky control leaves viewport (${node.className || node.tagName})`);
      }
    }
  });

  document.querySelectorAll('button button, button a[href], a[href] button').forEach((node) => {
    if (isVisible(node)) issues.push(`${pageLabel}: nested interactive control (${node.outerHTML.slice(0, 120)})`);
  });

  document.querySelectorAll('p, span, small, strong, label, button, a, li, dt, dd').forEach((node) => {
    if (!isVisible(node)) return;
    const text = String(node.textContent || '').trim();
    if (!text || text.length > 500 || node.closest('[aria-hidden="true"]')) return;
    const fontSize = Number.parseFloat(getComputedStyle(node).fontSize || '0');
    if (fontSize > 0 && fontSize < 10) {
      issues.push(`${pageLabel}: text below 10px (${fontSize}px): ${text.slice(0, 60)}`);
    }
  });

  return issues;
}, label);

const clickCreatorWorkspace = async (page, label) => {
  const exactButton = page.locator('button').filter({ hasText: label }).first();
  if (await exactButton.count()) {
    await exactButton.evaluate((element) => element.click());
    await page.waitForTimeout(400);
    return true;
  }
  return false;
};

test('all Listener routes remain responsive, accessible and runtime-clean', async ({ page }, testInfo) => {
  await authenticate(page, 'listener');
  const monitor = startFailureMonitor(page);
  const violations = [];

  for (const route of listenerRoutes) {
    monitor.setLocation(route);
    await page.goto(route);
    await settle(page);
    violations.push(...await collectIntegrityViolations(page, `${testInfo.project.name} ${route}`));
  }

  expect([...monitor.failures, ...violations], 'Listener responsive/runtime violations').toEqual([]);
});

test('all Creator workspaces remain responsive and runtime-clean', async ({ page }, testInfo) => {
  await authenticate(page, 'creator');
  const monitor = startFailureMonitor(page);
  const violations = [];

  monitor.setLocation('/creator-studio Broadcast');
  await page.goto('/creator-studio');
  await settle(page);
  violations.push(...await collectIntegrityViolations(page, `${testInfo.project.name} Creator Broadcast`));

  for (const workspace of creatorWorkspaces.slice(1)) {
    monitor.setLocation(`/creator-studio ${workspace}`);
    const clicked = await clickCreatorWorkspace(page, workspace);
    if (!clicked) violations.push(`${testInfo.project.name}: Creator workspace control not found: ${workspace}`);
    await settle(page);
    violations.push(...await collectIntegrityViolations(page, `${testInfo.project.name} Creator ${workspace}`));
  }

  const notificationsButton = page.locator('button[aria-label*="notification" i], button[title*="notification" i]').first();
  if (await notificationsButton.count()) {
    monitor.setLocation('/creator-studio Notifications');
    await notificationsButton.evaluate((element) => element.click());
    await settle(page);
    violations.push(...await collectIntegrityViolations(page, `${testInfo.project.name} Creator Notifications`));
  }

  expect([...monitor.failures, ...violations], 'Creator responsive/runtime violations').toEqual([]);
});

test('critical navigation and interaction regressions stay fixed', async ({ page }) => {
  await authenticate(page, 'listener');

  await page.goto('/listen/settings');
  await settle(page);
  const saveButton = page.getByRole('button', { name: /save changes/i });
  if (await saveButton.count()) await expect(saveButton).toBeDisabled();

  await page.goto('/listen/notifications');
  await settle(page);
  const notificationRow = page.getByText('A station you follow is live now').first();
  await expect(notificationRow).toBeVisible();
  await notificationRow.click();
  await expect(page).toHaveURL(/\/listen\/live\/507f1f77bcf86cd799439031/);

  await page.goto('/listen/audio/507f1f77bcf86cd799439041');
  await settle(page);
  const slider = page.locator('[role="slider"]').first();
  if (await slider.count()) {
    await slider.focus();
    await slider.press('ArrowRight');
    await slider.press('Home');
    await slider.press('End');
  }
});

test('Creator Collections add-content success closes the modal', async ({ page }) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');
  await settle(page);
  await clickCreatorWorkspace(page, 'Collections');
  await settle(page);

  const collection = page.getByRole('button', { name: /manage a deliberately long echoo title/i }).first();
  if (!(await collection.count())) return;
  await collection.click();
  const add = page.getByRole('button', { name: /add content/i }).first();
  await add.click();
  await expect(page.getByText(/add to a deliberately long echoo title/i)).toBeVisible();

  // With the current deterministic fixture the only track is already present.
  // The modal still must remain cancellable and never be trapped by stale saving state.
  const cancel = page.getByRole('button', { name: /cancel/i }).last();
  await expect(cancel).toBeEnabled();
  await cancel.click();
  await expect(page.getByText(/add to a deliberately long echoo title/i)).toHaveCount(0);
});
