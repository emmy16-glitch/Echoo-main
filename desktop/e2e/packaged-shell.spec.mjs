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
    const results = await mainPage.evaluate(async () => Promise.all([
      window.echooDesktop.openExternalWebUrl('javascript:alert(document.domain)'),
      window.echooDesktop.openExternalUrl('file:///C:/Windows/System32/cmd.exe'),
      window.echooDesktop.openExternalUrl('mailto:test@example.com?subject=ok%0D%0ABcc:bad@example.com'),
    ]));
    expect(results.every((result) => result?.opened === false)).toBe(true);
  });

  test('copies share text through the native Windows clipboard bridge', async () => {
    const expected = `Echoo packaged clipboard ${Date.now()}`;
    const result = await mainPage.evaluate((text) => window.echooDesktop.copyText(text), expected);
    const clipboardText = await electronApp.evaluate(({ clipboard }) => clipboard.readText());
    expect(result).toEqual({ copied: true });
    expect(clipboardText).toBe(expected);
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

  test('fits the Windows work area and honors reduced motion without decorative loader effects', async () => {
    const geometry = await mainPage.evaluate(() => ({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      availableWidth: window.screen.availWidth,
      availableHeight: window.screen.availHeight,
      desktopRuntime: document.documentElement.classList.contains('echoo-desktop-runtime'),
    }));
    expect(geometry.desktopRuntime).toBe(true);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 2);
    expect(geometry.viewportWidth).toBeLessThanOrEqual(geometry.availableWidth + 2);
    expect(geometry.viewportHeight).toBeLessThanOrEqual(geometry.availableHeight + 2);

    await mainPage.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotion = await mainPage.evaluate(() => {
      const motionProbe = document.createElement('div');
      motionProbe.className = 'eb-page-in';
      const skeletonProbe = document.createElement('div');
      skeletonProbe.className = 'echoo-skeleton';
      const successProbe = document.createElement('div');
      successProbe.className = 'echoo-success-pulse';
      document.body.append(motionProbe, skeletonProbe, successProbe);

      const motionStyles = getComputedStyle(motionProbe);
      const skeletonAfter = getComputedStyle(skeletonProbe, '::after');
      const successStyles = getComputedStyle(successProbe);
      const value = {
        motionAnimationName: motionStyles.animationName,
        motionDuration: motionStyles.animationDuration,
        skeletonDisplay: skeletonAfter.display,
        skeletonAnimationName: skeletonAfter.animationName,
        successAnimationDuration: successStyles.animationDuration,
      };
      motionProbe.remove();
      skeletonProbe.remove();
      successProbe.remove();
      return value;
    });
    expect(reducedMotion.motionAnimationName).toBe('none');
    expect(reducedMotion.skeletonDisplay).toBe('none');
    expect(reducedMotion.skeletonAnimationName).toBe('none');
    expect(Number.parseFloat(reducedMotion.successAnimationDuration)).toBeLessThanOrEqual(0.001);
  });
});
