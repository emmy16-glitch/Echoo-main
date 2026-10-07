import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath =
  process.env.ECHOO_PACKAGED_EXE ||
  path.join(desktopRoot, 'dist', 'win-unpacked', 'Echoo.exe');

function launchEnvironment(overrides = {}) {
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...environment } = process.env;
  return {
    ...environment,
    ECHOO_DISABLE_UPDATES: '1',
    ECHOO_DEBUG: '0',
    ...overrides,
  };
}

async function keepAutomationWindowsOffscreen(electronApp) {
  await electronApp.evaluate(({ app, BrowserWindow }) => {
    const moveOffscreen = (window) => {
      if (!window || window.isDestroyed()) return;
      window.setPosition(-10_000, -10_000, false);
    };

    for (const window of BrowserWindow.getAllWindows()) moveOffscreen(window);
    app.on('browser-window-created', (_event, window) => moveOffscreen(window));
  });
}

async function nativeWindowState(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows().map((window) => ({
      url: window.webContents.getURL(),
      visible: window.isVisible(),
      alwaysOnTop: window.isAlwaysOnTop(),
      destroyed: window.isDestroyed(),
      backgroundColor: window.getBackgroundColor(),
    }));
    return {
      windows,
      splash: windows.filter((window) => window.url.includes('splash.html')),
      main: windows.filter((window) => window.url.startsWith('echoo-app://app/')),
      recovery: windows.filter((window) => window.url.includes('offline.html')),
    };
  });
}

test.describe('packaged startup lifecycle', () => {
  test.skip(process.platform !== 'win32', 'Packaged desktop E2E runs on Windows only.');

  test.beforeAll(() => {
    if (!existsSync(executablePath)) {
      throw new Error(
        `Packaged Echoo executable is missing at ${executablePath}. Run npm run dist:win first.`
      );
    }
  });

  for (const delayMs of [2_000, 5_000, 15_000]) {
    test(`keeps exactly one non-topmost splash until delayed APP_READY (${delayMs}ms)`, async () => {
      const launchedAt = Date.now();
      const electronApp = await electron.launch({
        executablePath,
        env: launchEnvironment({
          ECHOO_DESKTOP_STARTUP_TEST: 'delayed-ready',
          ECHOO_TEST_APP_READY_DELAY_MS: String(delayMs),
        }),
      });
      await keepAutomationWindowsOffscreen(electronApp);

      try {
        await expect.poll(async () => {
          const state = await nativeWindowState(electronApp);
          return {
            splash: state.splash.length,
            visibleSplash: state.splash.filter((window) => window.visible).length,
            visibleMain: state.main.filter((window) => window.visible).length,
          };
        }).toEqual({ splash: 1, visibleSplash: 1, visibleMain: 0 });
        const waitingState = await nativeWindowState(electronApp);
        expect(waitingState.splash).toHaveLength(1);
        expect(waitingState.splash[0].visible).toBe(true);
        expect(waitingState.splash[0].alwaysOnTop).toBe(false);
        expect(waitingState.main.filter((window) => window.visible)).toHaveLength(0);

        const splashPage = electronApp.windows().find((candidate) =>
          candidate.url().includes('splash.html')
        );
        expect(splashPage).toBeTruthy();
        const splashVisual = await splashPage.evaluate(() => {
          const surface = document.querySelector('main');
          const mark = document.querySelector('.echoo-mark');
          const primary = document.querySelector('.echoo-mark-primary');
          const surfaceStyle = getComputedStyle(surface);
          const markStyle = getComputedStyle(mark);
          const primaryStyle = getComputedStyle(primary);
          return {
            visibleWordmark: document.querySelector('strong')?.textContent || '',
            ariaLabel: surface?.getAttribute('aria-label') || '',
            surfaceBackgroundImage: surfaceStyle.backgroundImage,
            surfaceWidth: surfaceStyle.width,
            surfaceHeight: surfaceStyle.height,
            markWidth: markStyle.width,
            markAnimationDuration: markStyle.animationDuration,
            markAnimationIterationCount: markStyle.animationIterationCount,
            markAnimationName: markStyle.animationName,
            primaryAnimationName: primaryStyle.animationName,
          };
        });
        expect(splashVisual).toMatchObject({
          visibleWordmark: '',
          ariaLabel: 'Echoo is opening',
          surfaceWidth: '192px',
          surfaceHeight: '192px',
          markWidth: '120px',
          markAnimationDuration: '1.25s',
          markAnimationIterationCount: '1',
          markAnimationName: 'echoo-mark-arrive',
        });
        expect(splashVisual.surfaceBackgroundImage).toContain('linear-gradient');
        expect(splashVisual.primaryAnimationName).toBe('echoo-primary-settle');

        await splashPage.emulateMedia({ reducedMotion: 'reduce' });
        const reducedMotionAnimation = await splashPage.locator('.echoo-mark').evaluate(
          (node) => getComputedStyle(node).animationName
        );
        expect(reducedMotionAnimation).toBe('none');

        await expect.poll(async () => {
          const state = await nativeWindowState(electronApp);
          return {
            windows: state.windows.length,
            visibleMain: state.main.filter((window) => window.visible).length,
            splash: state.splash.length,
          };
        }, { timeout: delayMs + 20_000 }).toEqual({ windows: 1, visibleMain: 1, splash: 0 });

        expect(Date.now() - launchedAt).toBeGreaterThanOrEqual(delayMs);

        const page = electronApp.windows().find((candidate) =>
          candidate.url().startsWith('echoo-app://app/')
        );
        expect(page).toBeTruthy();
        await page.evaluate(() => {
          void window.echooDesktop.reload();
        });

        await expect.poll(async () => {
          const state = await nativeWindowState(electronApp);
          return {
            splash: state.splash.length,
            visibleMain: state.main.filter((window) => window.visible).length,
          };
        }).toEqual({ splash: 1, visibleMain: 0 });

        await expect.poll(async () => {
          const state = await nativeWindowState(electronApp);
          return {
            windows: state.windows.length,
            splash: state.splash.length,
            visibleMain: state.main.filter((window) => window.visible).length,
          };
        }, { timeout: delayMs + 20_000 }).toEqual({ windows: 1, splash: 0, visibleMain: 1 });
      } finally {
        await electronApp.close().catch(() => {});
      }
    });
  }

  test('settles immediately without motion when Windows requests reduced motion', async () => {
    const electronApp = await electron.launch({
      executablePath,
      args: ['--force-prefers-reduced-motion=reduce'],
      env: launchEnvironment({
        ECHOO_DESKTOP_STARTUP_TEST: 'delayed-ready',
        ECHOO_TEST_APP_READY_DELAY_MS: '15000',
      }),
    });
    await keepAutomationWindowsOffscreen(electronApp);

    try {
      await expect.poll(async () => (await nativeWindowState(electronApp)).splash.length).toBe(1);
      const splashPage = electronApp.windows().find((candidate) =>
        candidate.url().includes('splash.html')
      );
      expect(splashPage).toBeTruthy();
      await splashPage.waitForLoadState('domcontentloaded');
      const reducedMotionState = await splashPage.evaluate(() => ({
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        markAnimation: getComputedStyle(document.querySelector('.echoo-mark')).animationName,
        primaryAnimation: getComputedStyle(document.querySelector('.echoo-mark-primary')).animationName,
      }));
      expect(reducedMotionState).toEqual({
        reducedMotion: true,
        markAnimation: 'none',
        primaryAnimation: 'none',
      });

      await expect.poll(async () => {
        const state = await nativeWindowState(electronApp);
        return {
          splash: state.splash.length,
          visibleMain: state.main.filter((window) => window.visible).length,
        };
      }, { timeout: 20_000 }).toEqual({ splash: 0, visibleMain: 1 });
    } finally {
      await electronApp.close().catch(() => {});
    }
  });

  test('destroys the splash and shows in-app recovery when APP_READY never arrives', async () => {
    const electronApp = await electron.launch({
      executablePath,
      env: launchEnvironment({
        ECHOO_DESKTOP_STARTUP_TEST: 'never-ready',
        ECHOO_STARTUP_READY_TIMEOUT_MS: '1500',
      }),
    });
    await keepAutomationWindowsOffscreen(electronApp);

    try {
      await expect.poll(async () => {
        const state = await nativeWindowState(electronApp);
        return {
          splash: state.splash.length,
          visibleSplash: state.splash.filter((window) => window.visible).length,
        };
      }).toEqual({ splash: 1, visibleSplash: 1 });
      await expect.poll(async () => {
        const state = await nativeWindowState(electronApp);
        return {
          windows: state.windows.length,
          splash: state.splash.length,
          visibleRecovery: state.recovery.filter((window) => window.visible).length,
        };
      }, { timeout: 15_000 }).toEqual({ windows: 1, splash: 0, visibleRecovery: 1 });

      const recoveryPage = electronApp.windows().find((candidate) =>
        candidate.url().includes('offline.html')
      );
      await expect(recoveryPage.getByRole('heading', { name: /couldn.t finish starting/i })).toBeVisible();
      await expect(recoveryPage.getByRole('button', { name: 'Try again' })).toBeEnabled();
      await recoveryPage.getByRole('button', { name: 'Try again' }).click();

      await expect.poll(async () => (await nativeWindowState(electronApp)).splash.length).toBe(1);
      await expect.poll(async () => {
        const state = await nativeWindowState(electronApp);
        return {
          windows: state.windows.length,
          splash: state.splash.length,
          visibleRecovery: state.recovery.filter((window) => window.visible).length,
        };
      }, { timeout: 15_000 }).toEqual({ windows: 1, splash: 0, visibleRecovery: 1 });
    } finally {
      await electronApp.close().catch(() => {});
    }
  });
});
