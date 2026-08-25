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
    args: ['.'],
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

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.getByText('Echoo desktop shell is ready').waitFor();

  const desktop = await window.evaluate(async () => ({
    bridgeAvailable: typeof window.echooDesktop !== 'undefined',
    nodeIsHidden: typeof window.require === 'undefined',
    appInfo: await window.echooDesktop.getAppInfo(),
    roomState: await window.echooDesktop.setRoomState({ active: true, muted: false, canToggleMute: true }),
    notificationsDisabled: await window.echooDesktop.setNotificationPreference(false),
    disabledNotification: await window.echooDesktop.notify({ type: 'message' }),
    notificationsEnabled: await window.echooDesktop.setNotificationPreference(true),
    enabledPreference: await window.echooDesktop.getNotificationPreference(),
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
    enabledNotification: await window.echooDesktop.notify({ type: 'message' }),
    restoredPreference: await window.echooDesktop.setNotificationPreference(false),
  }));

  assert.strictEqual(desktop.bridgeAvailable, true, 'desktop bridge should be exposed');
  assert.strictEqual(desktop.nodeIsHidden, true, 'Node APIs should not be exposed to the renderer');
  assert.strictEqual(desktop.appInfo.platform, process.platform, 'bridge should report the native platform');
  assert.strictEqual(desktop.appInfo.startUrl, url, 'shell should load the explicitly configured Echoo URL');
  assert.deepStrictEqual(desktop.roomState, { active: true, muted: false, canToggleMute: true }, 'bridge should retain only non-identifying room state');
  assert.strictEqual(desktop.notificationsDisabled, false, 'notifications should default to an explicit opt-in state');
  assert.deepStrictEqual(desktop.disabledNotification, { shown: false, reason: 'disabled' }, 'disabled notifications must not emit a native alert');
  assert.strictEqual(desktop.notificationsEnabled, true, 'notification opt-in should be persisted through the bridge');
  assert.strictEqual(desktop.enabledPreference, true, 'bridge should report the enabled notification preference');
  assert.deepStrictEqual(backgroundDesktop.roomState, { active: true, muted: false, canToggleMute: true }, 'live-room state should remain available while the window is hidden');
  assert.notStrictEqual(backgroundDesktop.enabledNotification.reason, 'disabled', 'enabled notifications must pass the opt-in gate');
  assert.strictEqual(backgroundDesktop.restoredPreference, false, 'smoke test should restore the default-off notification preference');
});
