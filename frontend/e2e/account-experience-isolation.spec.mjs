import { expect, test } from 'playwright/test';

const accountB = {
  id: '507f1f77bcf86cd799439099',
  _id: '507f1f77bcf86cd799439099',
  username: 'account-b',
  displayName: 'Account B',
  email: 'account-b@example.test',
  avatar: 'data:image/svg+xml,account-b-avatar',
  bio: 'Account B private profile',
  userType: 'creator',
  roles: ['listener', 'creator'],
  capabilities: { listener: true, creator: true },
  onboardingCompleted: true,
  profileCompleted: true,
  creatorOnboardingCompleted: true,
  creatorProfile: { creatorType: 'individual' },
};

test('Creator and Listener are one Account B session after Account A signs out', async ({ page }) => {
  await page.addInitScript(() => {
    // Mimic data left by Account A in an older Echoo browser session. A login
    // must replace it, never hydrate it into the next person’s workspace.
    localStorage.setItem('user', JSON.stringify({ id: 'account-a', username: 'account-a', avatar: 'account-a-avatar' }));
    localStorage.setItem('profileImage', 'account-a-avatar');
    localStorage.setItem('profileBio', 'Account A private bio');
    localStorage.setItem('echooActiveExperience', 'creator');
    localStorage.setItem('echooDownloads', JSON.stringify([{ id: 'account-a-track' }]));
    localStorage.setItem('echooCreatorAudioPreferencesV1', JSON.stringify({ masterVolume: 11 }));
    sessionStorage.setItem('echooPreparedBroadcastId', 'account-a-broadcast');
  });

  await page.route('**/api/auth/login', (route) => route.fulfill({
    json: {
      data: {
        user: accountB,
        accessToken: 'account-b-token',
        refreshToken: 'account-b-refresh-token',
      },
    },
  }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { data: { user: accountB } } }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Username or email').fill('account-b');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Login is unified and Listener-first even when this same account also has a
  // completed Creator workspace.
  await expect(page).toHaveURL(/\/listen$/);
  await expect.poll(() => page.evaluate((accountId) => ({
    user: JSON.parse(localStorage.getItem('user') || '{}'),
    token: localStorage.getItem('accessToken'),
    staleProfileImage: localStorage.getItem('profileImage'),
    staleProfileBio: localStorage.getItem('profileBio'),
    staleExperience: localStorage.getItem('echooActiveExperience'),
    scopedExperience: localStorage.getItem(`echooActiveExperience:${accountId}`),
    staleDownloads: localStorage.getItem('echooDownloads'),
    staleCreatorAudio: localStorage.getItem('echooCreatorAudioPreferencesV1'),
    staleBroadcast: sessionStorage.getItem('echooPreparedBroadcastId'),
  }), accountB.id)).toMatchObject({
    user: { id: accountB.id, username: 'account-b', avatar: accountB.avatar },
    token: 'account-b-token',
    staleProfileImage: null,
    staleProfileBio: null,
    staleExperience: null,
    scopedExperience: 'listener',
    staleDownloads: null,
    staleCreatorAudio: null,
    staleBroadcast: null,
  });

  const tokenBeforeSwitch = await page.evaluate(() => localStorage.getItem('accessToken'));
  await page.getByRole('tab', { name: 'Creator' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/);

  await expect.poll(() => page.evaluate((accountId) => ({
    user: JSON.parse(localStorage.getItem('user') || '{}'),
    token: localStorage.getItem('accessToken'),
    scopedExperience: localStorage.getItem(`echooActiveExperience:${accountId}`),
  }), accountB.id)).toMatchObject({
    user: { id: accountB.id, username: 'account-b', avatar: accountB.avatar },
    token: tokenBeforeSwitch,
    scopedExperience: 'creator',
  });
});
