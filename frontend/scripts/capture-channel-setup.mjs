import { chromium } from 'playwright';
import fs from 'fs';

const PARTIAL_CREATOR = {
  id: '507f1f77bcf86cd799439081',
  _id: '507f1f77bcf86cd799439081',
  username: 'partial.creator',
  displayName: 'Partial Creator',
  email: 'partial@example.test',
  userType: 'creator',
  roles: ['listener', 'creator'],
  profileCompleted: true,
  onboardingCompleted: false,
  creatorProfile: {},
};

const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // seed localStorage before any script runs
  await page.addInitScript(({ nextUser }) => {
    localStorage.setItem('accessToken', 'deep-access-token');
    localStorage.setItem('token', 'deep-access-token');
    localStorage.setItem('refreshToken', 'deep-refresh-token');
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('echooProfileCompleted', 'true');
    localStorage.setItem('echooActiveExperience', 'creator');
  }, { nextUser: PARTIAL_CREATOR });

  // navigate to root which should route to CreatorSetup for this seeded session
  const base = process.env.VITE_DEV_URL || 'http://127.0.0.1:5173';

  try {
    await page.goto(base + '/');

    // wait for the channel setup heading
    await page.waitForSelector('h1[id="channel-setup-title"], h2.card-title, h1', { timeout: 5000 }).catch(() => null);

    // ensure output folder
    const outDir = 'frontend/test-screenshots';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // small delay for responsive layout
      await page.waitForTimeout(600);
      const path = `${outDir}/channel-setup-${vp.name}.png`;
      await page.screenshot({ path, fullPage: true });
      console.log('Saved', path);
    }
  } catch (err) {
    console.error('Error capturing screenshots:', err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
