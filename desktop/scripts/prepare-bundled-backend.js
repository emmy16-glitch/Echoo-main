'use strict';

// Writes the LiveKit config that gets baked into the installer so a fresh
// download can go live with zero setup. Reads from the environment:
//
//   LIVEKIT_URL / LIVEKIT_PUBLIC_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
//
// If any are missing, writes an EMPTY file (and warns): the build still
// succeeds, but going live on that install needs a manual server-data/.env
// (see README). Run automatically by every `dist*` script before packaging.
//
// NOTE: these values ship inside the installer and are extractable by anyone
// who downloads it. That is the price of zero-config. If a key is ever
// abused, rotate it in LiveKit Cloud and cut a new release.

const fs = require('node:fs');
const path = require('node:path');

const OUT_FILE = path.join(__dirname, '..', '.bundled-server-env');

const value = (name) => String(process.env[name] || '').trim();

function main() {
  const url = value('LIVEKIT_URL');
  const publicUrl = value('LIVEKIT_PUBLIC_URL') || url;
  const apiKey = value('LIVEKIT_API_KEY');
  const apiSecret = value('LIVEKIT_API_SECRET');

  if (!url || !apiKey || !apiSecret) {
    fs.writeFileSync(OUT_FILE, '');
    console.warn(
      '[echoo-desktop] No LIVEKIT_* env vars — building WITHOUT embedded LiveKit config. ' +
        'Fresh installs will need a manual server-data/.env to go live.'
    );
    return;
  }

  const lines = [
    `# Embedded at build time (${new Date().toISOString()}).`,
    `# Users can override any of these in server-data/.env (it wins).`,
    `LIVEKIT_URL=${url}`,
    `LIVEKIT_PUBLIC_URL=${publicUrl}`,
    `LIVEKIT_API_KEY=${apiKey}`,
    `LIVEKIT_API_SECRET=${apiSecret}`,
    '',
  ];
  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`[echoo-desktop] Embedded LiveKit config for ${url} into the installer.`);
}

main();
