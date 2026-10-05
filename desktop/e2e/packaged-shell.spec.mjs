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

  test('has no document-level horizontal overflow and honors reduced motion', async () => {
    const geometry = await mainPage.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 2);

    await mainPage.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await mainPage.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'eb-page-in';
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).animationDuration;
      probe.remove();
      return value;
    });
    expect(['0s', '0.00001s', '0.01ms']).toContain(duration);
  });
});
