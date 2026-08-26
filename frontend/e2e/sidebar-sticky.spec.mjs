import { expect, test } from 'playwright/test';

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'echolistener',
  displayName: 'Echoo Listener',
  email: 'listener@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const creator = {
  id: '507f1f77bcf86cd799439011',
  _id: '507f1f77bcf86cd799439011',
  username: 'echoocreator',
  displayName: 'Echoo Creator',
  email: 'creator@example.test',
  userType: 'creator',
  roles: ['creator'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', artistName: 'Echoo Creator' },
};

const authenticate = async (page, role) => {
  const user = role === 'creator' ? creator : listener;
  await page.addInitScript((nextUser) => {
    localStorage.setItem('accessToken', `${nextUser.userType}-token`);
    localStorage.setItem('token', `${nextUser.userType}-token`);
    localStorage.setItem('refreshToken', `${nextUser.userType}-refresh-token`);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooRole', nextUser.userType);
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    if (nextUser.userType === 'creator') {
      localStorage.setItem('creatorSetup', JSON.stringify({ type: 'individual', name: nextUser.displayName }));
    }
  }, user);
};

const makeMainPageLong = async (page) => {
  await page.locator('main').evaluate((main) => {
    const spacer = document.createElement('div');
    spacer.dataset.testid = 'sticky-scroll-spacer';
    spacer.style.height = '1800px';
    spacer.style.pointerEvents = 'none';
    main.append(spacer);
  });
};

const assertStickyAtPageScroll = async (page, selector, label) => {
  const sidebar = page.locator(selector);
  await expect(sidebar).toBeVisible();
  await makeMainPageLong(page);

  const before = await sidebar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const after = await sidebar.boundingBox();
  const styles = await sidebar.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { position: computed.position, top: computed.top, height: computed.height };
  });

  expect(before, `${label}: sidebar has no measurable bounds`).not.toBeNull();
  expect(after, `${label}: sidebar has no measurable bounds after page scroll`).not.toBeNull();
  expect(styles.position, `${label}: sidebar must use sticky positioning`).toBe('sticky');
  expect(styles.top, `${label}: sidebar must pin to the viewport top`).toBe('0px');
  expect(Math.abs(after.y - before.y), `${label}: sidebar moved with the main page`).toBeLessThanOrEqual(1);
  expect(after.height, `${label}: sidebar must remain viewport-height`).toBeGreaterThanOrEqual(700);
};

test('Listener sidebar stays pinned while long Listener routes scroll', async ({ page }) => {
  await authenticate(page, 'listener');
  await page.goto('/listen/stations');

  if (page.viewportSize().width <= 760) {
    await expect(page.locator('.echoo-app-sidebar')).toBeHidden();
    return;
  }

  await assertStickyAtPageScroll(page, '.echoo-listener-v2-shell > .echoo-app-sidebar', 'Listener');
});

test('Creator Studio sidebar stays pinned while long studio routes scroll', async ({ page }) => {
  await authenticate(page, 'creator');
  await page.goto('/creator-studio');

  const sidebar = page.locator('.studio-final-shell > .studio-sidebar');
  if (page.viewportSize().width <= 760) {
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveCSS('position', 'fixed');
    return;
  }

  await assertStickyAtPageScroll(page, '.studio-final-shell > .studio-sidebar', 'Creator Studio');
});
