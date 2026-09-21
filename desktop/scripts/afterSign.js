'use strict';

// Runs after macOS code signing. Notarizes + staples the app when the
// APPLE_* build-time vars are present, and SKIPS WITH A WARNING when they
// aren't (unsigned local builds keep working — Gatekeeper just warns).
// Windows/Linux builds never reach this hook with anything to do.

async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context || {};
  if (electronPlatformName !== 'darwin') return;

  const appleId = String(process.env.APPLE_ID || '').trim();
  const applePassword = String(process.env.APPLE_APP_SPECIFIC_PASSWORD || '').trim();
  const teamId = String(process.env.APPLE_TEAM_ID || '').trim();
  if (!appleId || !applePassword || !teamId) {
    console.warn(
      '[echoo-desktop] afterSign: APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID not set — ' +
        'skipping notarization (unsigned build; Gatekeeper will warn on install).'
    );
    return;
  }

  let notarize;
  try {
    ({ notarize } = require('@electron/notarize'));
  } catch {
    console.warn(
      '[echoo-desktop] afterSign: @electron/notarize is not installed — ' +
        'skipping notarization. Run `npm install --save-dev @electron/notarize` once certs exist.'
    );
    return;
  }

  const appName = context?.packager?.appInfo?.productFilename || 'Echoo';
  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword: applePassword,
    teamId,
  });
  console.log('[echoo-desktop] afterSign: notarization complete.');
}

module.exports = afterSign;
module.exports.default = afterSign;
