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
  creatorProfile: {
    setupCompleted: true,
    creatorType: 'individual',
    category: 'Technology',
    isApproved: false,
  },
};

test('Creator Studio and Listening are one Account B session after Account A signs out', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Login' }).click();

  // Even Creator-capable accounts enter Echoo through the universal Listening
  // experience after login. Switching workspace does not change identity.
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
    activeExperience: 'listener',
    staleDownloads: null,
    staleCreatorAudio: null,
    staleBroadcast: null,
  });

  await page.getByRole('tab', { name: 'Creator Studio' }).click();
  await expect(page).toHaveURL(/\/creator-studio$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}')))
    .toMatchObject({ id: accountB.id, username: 'account-b', avatar: accountB.avatar });

  await page.getByRole('tab', { name: 'Listening' }).click();
  await expect(page).toHaveURL(/\/listen$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}')))
    .toMatchObject({ id: accountB.id, username: 'account-b', avatar: accountB.avatar });
});
