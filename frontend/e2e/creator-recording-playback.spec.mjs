import { expect, test } from 'playwright/test';

const creator = {
  id: '507f1f77bcf86cd799439099',
  _id: '507f1f77bcf86cd799439099',
  username: 'playbackcreator',
  displayName: 'Playback Creator',
  email: 'creator@example.test',
  userType: 'creator',
  roles: ['creator', 'listener'],
  onboardingCompleted: true,
  profileCompleted: true,
  creatorProfile: { creatorType: 'individual', category: 'Other', isApproved: true },
};

const recordingId = '507f1f77bcf86cd799439077';
const recording = {
  id: recordingId,
  _id: recordingId,
  title: 'Quick recording preview',
  duration: 3,
  createdAt: '2026-10-08T11:00:00.000Z',
  isPublic: false,
  genre: 'Spiritual',
};

// A legitimate, tiny WAV fixture that requires no remote media provider.
const wav = Buffer.alloc(44 + 16000 * 3 * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);
const streamUrl = 'data:audio/wav;base64,' + wav.toString('base64');

test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'recordings-test-token');
    localStorage.setItem('token', 'recordings-test-token');
    localStorage.setItem('refreshToken', 'recordings-test-refresh');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooOnboardingCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
  }, creator);
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { data: { user: creator } } }));
  await page.route('**/api/stations/mine/all**', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/broadcasts/mine/all**', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/studio/content**', (route) => route.fulfill({
    json: { data: { tracks: [recording], pagination: { total: 1, page: 1, limit: 20 } } },
  }));
  await page.route('**/api/audio/' + recordingId + '/stream-token', (route) => route.fulfill({
    json: { data: { streamUrl, expiresIn: 300 } },
  }));
  await page.route('**/api/studio/**', (route) => route.fulfill({ json: { data: {} } }));
  await page.route('**/api/**', (route) => route.fallback());
});

test('Recordings provides immediate active player feedback and playable audio', async ({ page }) => {
  await page.goto('/creator-studio/recordings');
  await expect(page.getByText('Quick recording preview').first()).toBeVisible();
  const play = page.getByRole('button', { name: 'Play recording', exact: true }).first();
  await play.hover();
  await play.click();
  const player = page.getByRole('region', { name: 'Recording player' });
  await expect(player).toBeVisible();
  await expect(player.getByText('Quick recording preview')).toBeVisible();
  await expect(player.getByRole('slider', { name: 'Recording playback position' })).toBeVisible();
  await expect(player.getByRole('slider', { name: 'Recording volume' })).toBeVisible();
  await expect(player.getByText('Now playing')).toBeVisible({ timeout: 10_000 });
  await player.getByRole('button', { name: 'Pause recording' }).click();
  await expect(player.getByText('Paused')).toBeVisible();
  await player.getByRole('button', { name: 'Play recording' }).click();
  await expect(player.getByText('Now playing')).toBeVisible();
  await player.getByRole('button', { name: 'Close recording player' }).click();
  await expect(player).toHaveCount(0);
});
