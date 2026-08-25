import { _electron as electron } from 'playwright';
import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const packagedExecutable = path.join(desktopDirectory, 'dist', 'linux-unpacked', 'echoo-studio');

function createFixtureServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Echoo packaged fixture</title><main>Echoo packaged shell is ready</main>');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

const { server, url } = await createFixtureServer();
const electronApp = await electron.launch({
  executablePath: packagedExecutable,
  args: [],
  env: {
    ...process.env,
    NODE_ENV: 'development',
    ECHOO_URL: url,
    ECHOO_DESKTOP_TEST: '1',
  },
});

try {
  const window = await electronApp.firstWindow();
  await window.getByText('Echoo packaged shell is ready').waitFor();

  const initialState = await window.evaluate(() => window.echooDesktop.setRoomState({
    active: true,
    muted: false,
    canToggleMute: true,
  }));
  assert.deepStrictEqual(initialState, { active: true, muted: false, canToggleMute: true });

  const backgroundState = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const desktopWindow = BrowserWindow.getAllWindows()[0];
    desktopWindow?.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const retainedWindow = BrowserWindow.getAllWindows()[0];
    return { exists: Boolean(retainedWindow), visible: retainedWindow?.isVisible() ?? true };
  });
  assert.strictEqual(backgroundState.exists, true, 'packaged shell should retain the active room window');
  assert.strictEqual(backgroundState.visible, false, 'active room should continue after the window is hidden');

  async function expectTrayCommand(action, expectedCommand) {
    await window.evaluate(() => {
      window.__echooRoomCommand = new Promise((resolve) => {
        const stop = window.echooDesktop.onRoomCommand((command) => {
          stop();
          resolve(command);
        });
      });
    });

    const invoked = await electronApp.evaluate((_electron, actionName) => (
      globalThis.__echooDesktopTest.invokeTrayAction(actionName)
    ), action);
    assert.strictEqual(invoked, true, `${action} should map to a tray action`);
    const command = await window.evaluate(() => window.__echooRoomCommand);
    assert.strictEqual(command, expectedCommand, `${action} should send ${expectedCommand}`);
  }

  await expectTrayCommand('toggleMute', 'toggle-mute');
  await window.evaluate(() => window.echooDesktop.setRoomState({ active: true, muted: true, canToggleMute: true }));
  await expectTrayCommand('toggleMute', 'toggle-mute');
  await expectTrayCommand('leaveRoom', 'leave-room');

  const shown = await electronApp.evaluate(({ BrowserWindow }) => {
    globalThis.__echooDesktopTest.invokeTrayAction('open');
    return BrowserWindow.getAllWindows()[0]?.isVisible() ?? false;
  });
  assert.strictEqual(shown, true, 'the tray Open Echoo action should restore the packaged app window');

  console.log('Packaged Linux shell verification passed: background room and reopen, mute, unmute, and leave-room tray actions are available.');
} finally {
  await electronApp.close();
  await new Promise((resolve) => server.close(resolve));
}
