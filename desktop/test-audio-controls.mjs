import { _electron as electron } from 'playwright';
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

function createFixtureServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Echoo Desktop Fixture</title><main>Echoo desktop shell is ready</main>');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

test('Echoo Desktop boots a secure shell with the native bridge', async (t) => {
  const { server, url } = await createFixtureServer();
  const electronApp = await electron.launch({
    args: ['.', ...(process.env.ECHOO_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ECHOO_URL: url,
    },
  });

  t.after(async () => {
    await electronApp.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const window = await electronApp.firstWindow({ timeout: 75_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.getByText('Echoo desktop shell is ready').waitFor();

  const desktop = await window.evaluate(async () => ({
    bridgeAvailable: typeof window.echooDesktop !== 'undefined',
    nodeIsHidden: typeof window.require === 'undefined',
    appInfo: await window.echooDesktop.getAppInfo(),
    roomState: await window.echooDesktop.setRoomState({ active: true, muted: false, canToggleMute: true }),
    notificationsDisabled: await window.echooDesktop.setNotificationPreferences({
      notificationsEnabled: false,
      notificationEvents: { message: false, roomStarted: true, roomEnded: true },
    }),
    disabledNotification: await window.echooDesktop.notify({ type: 'message' }),
    notificationsEnabled: await window.echooDesktop.setNotificationPreferences({
      notificationsEnabled: true,
      notificationEvents: { message: false, unknownEvent: true },
    }),
    disabledEventNotification: await window.echooDesktop.notify({ type: 'message' }),
    enabledPreference: await window.echooDesktop.getNotificationPreferences(),
  }));

  await electronApp.evaluate(({ BrowserWindow }) => {
    const desktopWindow = BrowserWindow.getAllWindows()[0];
    desktopWindow?.hide();
    return {
      exists: Boolean(desktopWindow),
      visible: desktopWindow?.isVisible() ?? false,
    };
  });

  const backgroundDesktop = await window.evaluate(async () => ({
    roomState: await window.echooDesktop.getRoomState(),
    enabledPreference: await window.echooDesktop.setNotificationPreferences({
      notificationEvents: { message: true },
    }),
    enabledNotification: await window.echooDesktop.notify({ type: 'message' }),
    restoredPreference: await window.echooDesktop.setNotificationPreferences({ notificationsEnabled: false }),
  }));

  assert.strictEqual(desktop.bridgeAvailable, true, 'desktop bridge should be exposed');
  assert.strictEqual(desktop.nodeIsHidden, true, 'Node APIs should not be exposed to the renderer');
  assert.strictEqual(desktop.appInfo.platform, process.platform, 'bridge should report the native platform');
  assert.strictEqual(desktop.appInfo.startUrl, url, 'shell should load the explicitly configured Echoo URL');
  assert.deepStrictEqual(desktop.roomState, { active: true, muted: false, canToggleMute: true }, 'bridge should retain only non-identifying room state');
  assert.strictEqual(desktop.notificationsDisabled.notificationsEnabled, false, 'notifications should default to an explicit opt-in state');
  assert.deepStrictEqual(desktop.disabledNotification, { shown: false, reason: 'disabled' }, 'disabled notifications must not emit a native alert');
  assert.strictEqual(desktop.notificationsEnabled.notificationsEnabled, true, 'notification opt-in should be persisted through the bridge');
  assert.strictEqual(desktop.notificationsEnabled.notificationEvents.message, false, 'message event preference should be persisted through the bridge');
  assert.strictEqual(Object.hasOwn(desktop.notificationsEnabled.notificationEvents, 'unknownEvent'), false, 'unknown event keys must not be persisted');
  assert.deepStrictEqual(desktop.disabledEventNotification, { shown: false, reason: 'event-disabled' }, 'disabled event notifications must not emit a native alert');
  assert.strictEqual(desktop.enabledPreference.notificationsEnabled, true, 'bridge should report the enabled notification preference');
  assert.strictEqual(desktop.enabledPreference.notificationEvents.message, false, 'bridge should report the configured event preference');
  assert.deepStrictEqual(backgroundDesktop.roomState, { active: true, muted: false, canToggleMute: true }, 'live-room state should remain available while the window is hidden');
  assert.strictEqual(backgroundDesktop.enabledPreference.notificationEvents.message, true, 'the selected event should be re-enabled through the bridge');
  assert.notStrictEqual(backgroundDesktop.enabledNotification.reason, 'disabled', 'enabled notifications must pass the opt-in gate');
  assert.notStrictEqual(backgroundDesktop.enabledNotification.reason, 'event-disabled', 'enabled events must pass the per-event gate');
  assert.strictEqual(backgroundDesktop.restoredPreference.notificationsEnabled, false, 'smoke test should restore the default-off notification preference');
});
