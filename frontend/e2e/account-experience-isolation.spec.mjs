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
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', artistName: 'Account B' },
};

test('one authenticated account owns both Listener and Creator experiences without stale Account A data', async ({ page }) => {
  await page.addInitScript(() => {
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
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // A fresh login always opens the Listener experience. Creator remains a
  // capability of the same account and can be entered without re-authentication.
  await expect(page).toHaveURL(/\/listen$/);
  await expect.poll(() => page.evaluate(() => ({
    user: JSON.parse(localStorage.getItem('user') || '{}'),
    token: localStorage.getItem('accessToken'),
    staleProfileImage: localStorage.getItem('profileImage'),
    staleProfileBio: localStorage.getItem('profileBio'),
    activeExperience: localStorage.getItem('echooActiveExperience'),
    staleDownloads: localStorage.getItem('echooDownloads'),
    staleCreatorAudio: localStorage.getItem('echooCreatorAudioPreferencesV1'),
    staleBroadcast: sessionStorage.getItem('echooPreparedBroadcastId'),
  }))).toMatchObject({
    user: { id: accountB.id, username: 'account-b', avatar: accountB.avatar },
    token: 'account-b-token',
    staleProfileImage: null,
    staleProfileBio: null,
    activeExperience: null,
    staleDownloads: null,
    staleCreatorAudio: null,
    staleBroadcast: null,
  });

  await page.getByRole('tab', { name: 'Creator' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('creator');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}')))
    .toMatchObject({ id: accountB.id, username: 'account-b', creatorProfile: { creatorType: 'individual' } });

  await page.getByRole('tab', { name: 'Listener' }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echooActiveExperience'))).toBe('listener');
});
