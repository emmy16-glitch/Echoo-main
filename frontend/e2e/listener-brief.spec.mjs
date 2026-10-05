import { test, expect } from 'playwright/test';

const user = { id: '507f1f77bcf86cd799439012', username: 'listener', roles: ['listener'], userType: 'listener', onboardingCompleted: true, profileCompleted: true };
const authenticate = (page) => page.addInitScript((identity) => {
  localStorage.setItem('accessToken', 'listener-token');
  localStorage.setItem('user', JSON.stringify(identity));
  localStorage.setItem('echooRole', 'listener');
  localStorage.setItem('echooProfileCompleted', 'true');
  localStorage.setItem('echooOnboardingCompleted', 'true');
}, user);

test('listener has five consistent destinations and honest compact discovery', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/listener/dashboard', route => route.fulfill({ json: { success: true, data: { liveNow: [], upcoming: [], continueListening: [] } } }));
  await page.route('**/api/playlists?*', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.getByText('Nothing is live right now', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming broadcasts' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Popular|Trending/ })).toHaveCount(0);
  const nav = page.locator(await page.locator('.listener-v2-mobile-nav').isVisible() ? '.listener-v2-mobile-nav' : '.listener-v2-nav');
  await expect(nav.getByRole('button')).toHaveText(['Discover', 'Following', 'Library', 'Search', 'Profile']);
  await nav.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/listen\/library$/);
  await expect(nav.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('History has no disconnected legacy content-type filters', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/history?*', route => route.fulfill({ json: { success: true, data: { history: [] } } }));
  await page.route('**/api/history/stats', route => route.fulfill({ json: { success: true, data: { totalPlays: 0, totalListeningTime: 0 } } }));
  await page.goto('/listen/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  for (const label of ['Stations', 'Shows', 'Episodes', 'Clips']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('No listening history yet.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('live card does not invent listener counts', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/listener/dashboard', route => route.fulfill({ json: { success: true, data: { liveNow: [{ id: 'broadcast', title: 'Real broadcast', station: { name: 'Real creator' } }], upcoming: [] } } }));
  await page.goto('/listen');
  await expect(page.locator('.listener-v2-live-card')).toBeVisible();
  await expect(page.locator('.listener-v2-live-listeners')).toHaveCount(0);
  await expect(page.locator('.listener-v2-live-meta')).toContainText('Real creator');
  await expect(page.locator('.listener-v2-live-meta')).toContainText('Listen Live');
});

test('recording player survives navigation without creating another audio element', async ({ page }) => {
  await authenticate(page);
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event('play')); return Promise.resolve(); };
  });
  await page.route('**/api/audio?*', route => route.fulfill({ json: { data: [{ id: '507f1f77bcf86cd799439041', title: 'Test recording', artistName: 'Test creator', fileUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', duration: 60 }] } }));
  await page.goto('/listen');
  const play = page.getByRole('button', { name: /^Play / }).first();
  await expect(play).toBeVisible();
  await play.click();
  await expect(page.locator('.listener-v2-player')).toBeVisible();
  await page.evaluate(() => { window.originalAudio = document.querySelector('.listener-v2-root > audio'); });
  for (const path of ['/listen/following', '/listen/library', '/listen/search', '/listen/profile']) {
    await page.evaluate(path => { const button = [...document.querySelectorAll('.listener-v2-mobile-nav button, .listener-v2-nav button')].find(button => button.textContent === ({ '/listen/following': 'Following', '/listen/library': 'Library', '/listen/search': 'Search', '/listen/profile': 'Profile' })[path]); button.click(); }, path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    expect(await page.evaluate(() => window.originalAudio === document.querySelector('.listener-v2-root > audio'))).toBe(true);
    await expect(page.locator('.listener-v2-root > audio')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('live player stays mounted after leaving the room and returns without a second connection', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen');
  await page.locator('.listener-v2-live-meta').first().click();
  await expect(page.locator('.echoo-livekit-listener')).toHaveCount(1);
  await page.evaluate(() => { window.originalLivePlayer = document.querySelector('.echoo-livekit-listener'); });
  await page.locator('.listener-v2-room-toolbar button').first().click();
  await expect(page.locator('.listener-v2-live-mini')).toBeVisible();
  expect(await page.evaluate(() => window.originalLivePlayer === document.querySelector('.echoo-livekit-listener'))).toBe(true);
  await page.getByRole('button', { name: 'Open live room' }).click();
  await expect(page.locator('.listener-v2-live-room')).toBeVisible();
  expect(await page.evaluate(() => window.originalLivePlayer === document.querySelector('.echoo-livekit-listener'))).toBe(true);
});

test('server finalization is independent of device export and duplicate End requests', async ({ page }) => {
  await authenticate(page);
  let finalizations = 0;
  await page.route('**/api/broadcasts/*/recording-chunks/complete', async route => {
    finalizations++;
    await route.fulfill({ json: { data: { replay: { status: 'ready', audioId: '507f1f77bcf86cd799439041' } } } });
  });
  await page.goto('/listen');
  const result = await page.evaluate(async () => {
    const { startAutosave, completeDeviceCopyChoice } = await import('/src/services/recordingAutosave.js');
    const { getRecordingDevicePreferences, setRecordingDevicePreferences } = await import('/src/services/recordingDevicePreferences.js');
    let disposed = 0;
    setRecordingDevicePreferences({ decided: true, autoSave: false });
    const options = { recording: { blob: new Blob([new Uint8Array(44)], { type: 'audio/wav' }), broadcastId: '507f1f77bcf86cd799439031', serverRecordingPrimary: true, dispose: async () => { disposed++; } }, broadcast: { id: '507f1f77bcf86cd799439031', title: 'Recorded broadcast' } };
    const completed = await Promise.all([startAutosave(options), startAutosave(options)]);
    setRecordingDevicePreferences({ decided: true, autoSave: true, format: 'wav' });
    const optionalBroadcastId = '507f1f77bcf86cd799439032';
    const optional = await startAutosave({ recording: { ...options.recording, broadcastId: optionalBroadcastId }, broadcast: { ...options.broadcast, id: optionalBroadcastId } });
    const preferenceBeforeSkip = getRecordingDevicePreferences();
    const skipped = await completeDeviceCopyChoice(optionalBroadcastId, 'none');
    const preferenceAfterSkip = getRecordingDevicePreferences();
    return {
      disposed,
      audioIds: completed.map(value => value.audioId),
      optionalReady: Boolean(optional.audioId),
      deviceChoice: optional.needsDeviceChoice,
      skippedLocalCopy: skipped?.localCopy?.skipped,
      preferenceBeforeSkip,
      preferenceAfterSkip,
    };
  });
  expect(finalizations).toBe(2);
  expect(result.disposed).toBe(2);
  expect(result.audioIds).toEqual(['507f1f77bcf86cd799439041', '507f1f77bcf86cd799439041']);
  expect(result.optionalReady).toBe(true);
  expect(result.deviceChoice).toBe(true);
  expect(result.skippedLocalCopy).toBe('device-copy-skipped-for-recording');
  expect(result.preferenceBeforeSkip).toEqual({ decided: true, autoSave: true, format: 'wav' });
  expect(result.preferenceAfterSkip).toEqual(result.preferenceBeforeSkip);
});

test('listener guest header stays listener-focused and search describes its real scope', async ({ page }) => {
  await page.goto('/listen');
  await expect(page.getByRole('button', { name: 'Create Channel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search Echoo...')).toBeVisible();
});

test('Following does not render the same live creator twice', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen/following');
  await expect(page.locator('.listener-v2-following-live-card')).toHaveCount(1);
  await expect(page.locator('.listener-v2-following-row')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'All following', exact: true })).toHaveCount(0);
});

test('Library has one saved-audio owner and links to dedicated secondary pages', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen/library');
  const sections = page.locator('.listener-v2-category-tabs');
  await expect(sections.getByRole('button')).toHaveText(['Saved audio', 'History', 'Playlists', 'Saved moments', 'Downloads']);
  await expect(sections.getByRole('button', { name: 'Saved audio', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(/% listened/)).toHaveCount(0);
});

test('Listener search renders only actionable result types', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen/search?q=Echoo');
  await expect(page.getByRole('heading', { name: 'Creators', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Channels', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audio', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Playlists', exact: true })).toHaveCount(0);
});

test('listener secondary pages avoid duplicate navigation and discovery surfaces', async ({ page }) => {
  await authenticate(page);

  await page.goto('/listen');
  await expect(page.getByRole('heading', { name: 'Creator playlists', exact: true })).toHaveCount(0);

  await page.goto('/listen/playlist');
  await expect(page.getByRole('heading', { name: 'Playlists' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Continue listening', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Popular playlists', exact: true })).toHaveCount(0);

  await page.goto('/listen/search');
  await expect(page.locator('.listener-v2-header-search')).toHaveCount(0);

  await page.goto('/listen/profile');
  const links = page.locator('.listener-profile-links');
  await expect(links.getByRole('button', { name: 'Following', exact: true })).toHaveCount(0);
  await expect(links.getByRole('button', { name: 'Library', exact: true })).toHaveCount(0);
  await expect(links.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(links.getByRole('button', { name: 'Help and support', exact: true })).toBeVisible();
  await links.getByRole('button', { name: 'Help and support', exact: true }).click();
  await expect(page).toHaveURL(/\/listen\/settings\?section=help$/);
  await expect(page.getByRole('heading', { name: 'Help & support' })).toBeVisible();
  await expect(links.getByRole('button', { name: 'Downloads', exact: true })).toHaveCount(0);
  await expect(links.getByRole('button', { name: 'Listening history', exact: true })).toHaveCount(0);
  await expect(links.getByRole('button', { name: 'Notifications', exact: true })).toHaveCount(0);
  await expect(links.getByRole('button', { name: 'Audio preferences', exact: true })).toHaveCount(0);
});

test('listener settings exposes only working sections and Playback has no stale placeholder', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen/settings?section=playback');
  await expect(page.getByRole('heading', { name: 'Listener volume' })).toBeVisible();
  await expect(page.getByText('This section is managed through your account profile for now.')).toHaveCount(0);
  const settingsNav = page.getByLabel('Settings categories');
  await expect(settingsNav.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  await expect(settingsNav.getByRole('button', { name: 'Playback', exact: true })).toBeVisible();
  await expect(settingsNav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(settingsNav.getByRole('button', { name: 'Account', exact: true })).toHaveCount(0);
  await expect(settingsNav.getByRole('button', { name: 'Downloads', exact: true })).toHaveCount(0);
  await expect(settingsNav.getByRole('button', { name: 'Privacy', exact: true })).toHaveCount(0);
  await expect(settingsNav.getByRole('button', { name: 'About Echoo', exact: true })).toHaveCount(0);
});

test('live room avoids duplicate live and listener metadata and hides internal connection wording', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen/live/507f1f77bcf86cd799439031');
  await expect(page.locator('.listener-v2-room-live-badge')).toHaveCount(1);
  await expect(page.locator('.listener-v2-room-live-text')).toHaveCount(0);
  await expect(page.locator('.listener-v2-room-listeners')).toHaveCount(0);
  await expect(page.locator('.listener-v2-room-event-meta').getByText(/listening$/)).toHaveCount(1);
  await expect(page.getByText(/Room (connected|fallback|connecting)/i)).toHaveCount(0);
  await expect(page.getByText(/studio mix|LiveKit|RTP|ICE/i)).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Live volume' })).toBeVisible();
});

test('live actions persist, roll back failures, copy links, and open and close chat', async ({ page }) => {
  await authenticate(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedLink = text; } } }));
  let attempts = 0;
  await page.route('**/api/broadcasts/*/like', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { data: { liked: false } } });
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 500, json: { error: { message: 'Try again' } } }) : route.fulfill({ json: { data: { liked: true } } });
  });
  await page.route('**/api/saved-moments*', route => route.fulfill({ json: { data: route.request().method() === 'POST' ? { id: 'saved', broadcastId: '507f1f77bcf86cd799439031', timestampMs: 0 } : [] } }));
  await page.goto('/listen/live/507f1f77bcf86cd799439031');
  await page.locator('.listener-room-actions summary').click();
  const like = page.getByRole('button', { name: 'Like', exact: true });
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await like.click();
  await expect(page.getByRole('button', { name: 'Liked', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByText('Live link copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.copiedLink)).toContain('/listen/live/507f1f77bcf86cd799439031');
  if (await page.locator('.listener-v2-room-chat-toggle').isVisible()) {
    await page.locator('.listener-v2-room-chat-toggle').click();
    await expect(page.getByRole('textbox', { name: 'Message live chat' })).toBeInViewport();
    await page.locator('.listener-v2-room-chat-close').click();
    await expect(page.locator('.listener-v2-room-chat')).not.toHaveClass(/is-open/);
  }
});

test('all listener destinations fit the required viewport widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Run the full width sweep once.');
  test.setTimeout(120_000);
  await authenticate(page);
  await page.goto('/listen');
  for (const width of [320, 360, 390, 414, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/listen', '/listen/following', '/listen/library', '/listen/search', '/listen/profile']) {
      const labels = { '/listen': 'Discover', '/listen/following': 'Following', '/listen/library': 'Library', '/listen/search': 'Search', '/listen/profile': 'Profile' };
      const nav = page.locator(width < 768 ? '.listener-v2-mobile-nav' : '.listener-v2-nav');
      await nav.getByRole('button', { name: labels[route], exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.locator('.listener-v2-page'), `${route} at ${width}`).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`).toBe(true);
      const header = await page.locator('.listener-v2-header').boundingBox();
      const account = await page.locator('.account-experience-trigger').boundingBox();
      expect(account.y + account.height, `Account control overlaps content at ${width}`).toBeLessThanOrEqual(header.y + header.height);
    }
  }
});

test('live room stays inside the viewport from 320px mobile through desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Run the live-room width sweep once.');
  test.setTimeout(90_000);
  await authenticate(page);
  await page.route('**/api/chat/broadcast/*/messages?*', route => route.fulfill({
    json: {
      data: [{
        id: 'long-chat-message',
        displayName: 'VeryLongListenerNameThatMustNeverPushTheChatOutsideTheViewport',
        content: 'W'.repeat(280),
        createdAt: new Date().toISOString(),
        reactions: [],
      }],
    },
  }));

  for (const width of [320, 360, 390, 414, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/listen/live/507f1f77bcf86cd799439031');
    await expect(page.locator('.listener-v2-live-room'), `live room at ${width}`).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `live room overflows horizontally at ${width}`
    ).toBe(true);

    const play = await page.locator('.listener-v2-room-play').boundingBox();
    expect(play, `play control exists at ${width}`).not.toBeNull();
    expect(play.x, `play control starts inside viewport at ${width}`).toBeGreaterThanOrEqual(0);
    expect(play.x + play.width, `play control ends inside viewport at ${width}`).toBeLessThanOrEqual(width);

    if (width < 768) {
      const chatToggle = page.locator('.listener-v2-room-chat-toggle');
      const chat = await chatToggle.boundingBox();
      expect(chat, `chat toggle exists at ${width}`).not.toBeNull();
      expect(chat.x + chat.width, `chat toggle stays inside viewport at ${width}`).toBeLessThanOrEqual(width);

      await chatToggle.click();
      const sheet = page.locator('.listener-v2-room-chat');
      await expect(sheet).toHaveClass(/is-open/);
      const sheetBox = await sheet.boundingBox();
      expect(sheetBox, `chat sheet exists at ${width}`).not.toBeNull();
      expect(sheetBox.x, `chat sheet starts inside viewport at ${width}`).toBeGreaterThanOrEqual(0);
      expect(sheetBox.x + sheetBox.width, `chat sheet ends inside viewport at ${width}`).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `open chat overflows horizontally at ${width}`
      ).toBe(true);
      await expect(page.locator('.lex-chat-message').first(), `long chat message visible at ${width}`).toBeVisible();
      const messageBox = await page.locator('.lex-chat-message').first().boundingBox();
      expect(messageBox.x, `chat message starts inside sheet at ${width}`).toBeGreaterThanOrEqual(sheetBox.x - 1);
      expect(messageBox.x + messageBox.width, `chat message ends inside sheet at ${width}`).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1);
      await expect(page.getByRole('textbox', { name: 'Message live chat' })).toBeInViewport();
      await page.locator('.listener-v2-room-chat-close').click();
      await expect(sheet).not.toHaveClass(/is-open/);
    }
  }
});

test('the audience gain path defaults to unity and deliberate listener volume survives engine remounts', async ({ page }) => {
  await authenticate(page);
  await page.goto('/listen');
  const values = await page.evaluate(async () => {
    const { getEchooMixerState } = await import('/src/services/echooMixerService.js');
    const { readListenerVolume, saveListenerVolume } = await import('/src/services/listenerVolume.js');
    const state = getEchooMixerState();
    const initial = readListenerVolume();
    saveListenerVolume(0.42);
    return { initial, gains: Object.fromEntries(Object.entries(state.channels).map(([id, channel]) => [id, channel.gain])), master: state.master.gain, retained: readListenerVolume() };
  });
  expect(values.initial).toBe(1);
  expect(values.gains).toEqual({ host: 1, channel2: 1, guest: 1, media: 1, screen: 1 });
  expect(values.master).toBe(1);
  expect(values.retained).toBe(0.42);
  await page.reload();
  await expect(page.locator('.listener-v2-root > audio')).toHaveJSProperty('volume', 0.42);
});
