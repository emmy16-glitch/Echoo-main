import { test, expect } from 'playwright/test';

const listener = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  username: 'new-creator',
  displayName: 'New Echoo Creator',
  email: 'new-creator@example.test',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
  profileCompleted: true,
};

const activatedCreator = {
  ...listener,
  userType: 'creator',
  roles: ['listener', 'creator'],
  creatorProfile: { isApproved: false },
};

const fulfill = (route, data) => route.fulfill({ json: { data } });

test('Listener opens contextual Channel onboarding and reaches a public Channel preview', async ({ page }, testInfo) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'listener-token');
    localStorage.setItem('token', 'listener-token');
    localStorage.setItem('refreshToken', 'listener-refresh-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'listener');
    localStorage.removeItem('echooRole');
  }, listener);

  await page.route('**/api/auth/me', (route) => fulfill(route, { user: listener }));
  await page.route('**/api/onboarding/activate-creator', (route) => fulfill(route, {
    user: activatedCreator,
    capabilities: { listener: true, creator: true },
    creatorSetupCompleted: false,
    nextStep: 'creator-type-selection',
  }));

  await page.goto('/listen');
  await expect(page.getByRole('button', { name: 'Create your Channel' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your Channel' }).click();

  await expect(page.getByRole('heading', { name: /How will you create/i })).toBeVisible();
  await expect(page.locator('.eor-hero-copy h1')).toContainText('creator identity.');
  await expect(page.locator('.eor-creator-hero-card')).toBeVisible();
  await expect(page.getByText(/same Echoo account/i)).toBeVisible();

  await page.getByRole('radio', { name: /Individual/i }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: /Set up your Channel/i })).toBeVisible();
  await expect(page.getByText('New Echoo Creator', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('@new-creator', { exact: true }).first()).toBeVisible();

  await page.getByLabel('Channel name').fill('New Echoo Creator Live');
  await page.getByLabel('Category').selectOption('Technology');
  await page.getByLabel('What will you create?').fill('Live technology conversations and community shows.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: /Almost ready/i })).toBeVisible();
  const preview = page.getByLabel('Your public Channel preview');
  await expect(preview).toContainText('New Echoo Creator Live');
  await expect(preview).toContainText('Technology');
  await expect(preview).toContainText('@new-creator');
  await expect(page.getByText('0 followers', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Creator Studio' })).toBeVisible();

  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('accessToken'),
    userId: JSON.parse(localStorage.getItem('user') || '{}').id,
    experience: localStorage.getItem('echooActiveExperience'),
    legacyRole: localStorage.getItem('echooRole'),
  }))).toEqual({
    token: 'listener-token',
    userId: listener.id,
    experience: 'creator',
    legacyRole: null,
  });

  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('channel-ready.png'), fullPage: true });
});
