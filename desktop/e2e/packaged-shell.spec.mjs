import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath =
  process.env.ECHOO_PACKAGED_EXE ||
  path.join(desktopRoot, 'dist', 'win-unpacked', 'Echoo.exe');

test.describe('packaged Echoo Windows shell', () => {
  test.skip(process.platform !== 'win32', 'Packaged desktop E2E runs on Windows only.');

  let electronApp;
  let mainPage;

  test.beforeAll(async () => {
    if (!existsSync(executablePath)) {
      throw new Error(
        `Packaged Echoo executable is missing at ${executablePath}. Run npm run dist:win first.`
      );
    }

    electronApp = await electron.launch({
      executablePath,
      args: ['echoo://listen'],
      env: {
        ...process.env,
        ECHOO_DISABLE_UPDATES: '1',
        ECHOO_DEBUG: '0',
      },
    });

    await electronApp.firstWindow();

    await expect
      .poll(
        () => {
          const page = electronApp
            .windows()
            .find((candidate) => candidate.url().startsWith('echoo-app://app/'));
          mainPage = page || mainPage;
          return page?.url() || '';
        },
        { timeout: 30_000, message: 'Echoo should reveal its packaged local renderer.' }
      )
      .toMatch(/^echoo-app:\/\/app\//);

    await mainPage.waitForLoadState('domcontentloaded');

    await expect
      .poll(() => mainPage.locator('#root').evaluate((node) => node.childElementCount))
      .toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    await electronApp?.close().catch(() => {});
  });

  test('uses the local renderer and secure desktop bridge', async () => {
    const state = await mainPage.evaluate(async () => {
      const appInfo = await window.echooDesktop.getAppInfo();
      return {
        protocol: window.location.protocol,
        appIdentity: document.querySelector('meta[name="echoo-app"]')?.content || '',
        isDesktop: window.echooDesktop?.isDesktop === true,
        platform: window.echooDesktop?.platform,
        processType: typeof window.process,
        requireType: typeof window.require,
        appInfo,
      };
    });

    expect(state.protocol).toBe('echoo-app:');
    expect(state.appIdentity).toBe('echoo-frontend');
    expect(state.isDesktop).toBe(true);
    expect(state.platform).toBe('win32');
    expect(state.processType).toBe('undefined');
    expect(state.requireType).toBe('undefined');
    expect(state.appInfo?.ok).toBe(true);
    expect(state.appInfo?.appName).toBe('Echoo');
    expect(state.appInfo?.appVersion).toBe('2.0.0');
    expect(state.appInfo?.startUrl).toBe('echoo-app://app/index.html');
  });

  test('applies the cold-start echoo:// route inside the local package', async () => {
    await expect
      .poll(() => mainPage.evaluate(() => window.location.hash))
      .toBe('#/listen');
    expect(mainPage.url()).not.toContain('echoo.digi02.org');
  });

  test('blocks unsafe external schemes at the native boundary', async () => {
    const result = await mainPage.evaluate(() =>
      window.echooDesktop.openExternalWebUrl('javascript:alert(document.domain)')
    );
    expect(result?.opened).toBe(false);
  });

  test('round-trips native Listener replay state through the secure bridge', async () => {
    const state = await mainPage.evaluate(async () => {
      await window.echooDesktop.setRoomState({
        active: true,
        mode: 'listener',
        kind: 'replay',
        title: 'Playwright replay',
        playing: true,
        canTogglePlay: true,
        keepAwake: false,
      });
      const current = await window.echooDesktop.getRoomState();
      await window.echooDesktop.setRoomState({
        active: false,
        mode: 'idle',
        kind: 'idle',
      });
      return current;
    });

    expect(state).toMatchObject({
      active: true,
      mode: 'listener',
      kind: 'replay',
      title: 'Playwright replay',
      playing: true,
      canTogglePlay: true,
      keepAwake: false,
    });
  });

  test('streams recording chunks to the managed Windows library and commits atomically', async () => {
    const result = await mainPage.evaluate(async () => {
      const filename = `playwright-${Date.now()}.mp3`;
      const chunkSize = 256 * 1024;
      const totalBytes = chunkSize * 2;

      const started = await window.echooDesktop.beginRecordingSave({
        filename,
        format: 'mp3',
        automatic: true,
        totalBytes,
      });
      if (!started?.sessionId) return { started };

      const first = new Uint8Array(chunkSize);
      const second = new Uint8Array(chunkSize);
      first.fill(0x45);
      second.fill(0x43);

      const writeOne = await window.echooDesktop.appendRecordingChunk(started.sessionId, first);
      const writeTwo = await window.echooDesktop.appendRecordingChunk(started.sessionId, second);
      const finished = await window.echooDesktop.finishRecordingSave(started.sessionId);

      // CI runners are ephemeral, but best-effort cleanup keeps local developer
      // E2E runs from accumulating test recordings.
      const cleanup = finished?.saved && finished?.path
        ? await window.echooDesktop.trashRecording(finished.path).catch(() => null)
        : null;

      return { started, writeOne, writeTwo, finished, cleanup, totalBytes };
    });

    expect(result.started?.sessionId).toBeTruthy();
    expect(result.writeOne?.written).toBe(true);
    expect(result.writeTwo?.written).toBe(true);
    expect(result.writeTwo?.bytesWritten).toBe(result.totalBytes);
    expect(result.finished?.saved).toBe(true);
    expect(result.finished?.path).toMatch(/Echoo Recordings/i);
    expect(result.finished?.path).toMatch(/\.mp3$/i);
  });

  test('has no document-level horizontal overflow and honors reduced motion', async () => {
    const geometry = await mainPage.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 2);

    await mainPage.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotion = await mainPage.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'eb-page-in';
      document.body.appendChild(probe);
      const styles = getComputedStyle(probe);
      const value = {
        animationName: styles.animationName,
        animationDuration: styles.animationDuration,
      };
      probe.remove();
      return value;
    });
    expect(reducedMotion.animationName).toBe('none');
  });
});
