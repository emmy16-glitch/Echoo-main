const REQUIRED_PUBLIC_ENV = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SOCKET_URL',
  'EXPO_PUBLIC_LIVEKIT_URL',
];
const runningAsEasHook = process.argv.includes('--eas-hook');
const easProfile = process.env.EAS_BUILD_PROFILE || '';

const LOCAL_OR_PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|10\.0\.2\.2)$/i;

function readDotEnv() {
  try {
    const fs = require('fs');
    const path = require('path');
    const file = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');

    for (const line of file.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, name, rawValue] = match;
      if (process.env[name]) continue;
      process.env[name] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // EAS cloud builds receive environment variables from EAS, not .env.
  }
}

function assertPublicUrl(name, value) {
  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  const allowedProtocols = name === 'EXPO_PUBLIC_LIVEKIT_URL'
    ? new Set(['wss:', 'https:'])
    : new Set(['https:']);

  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(`${name} must use ${Array.from(allowedProtocols).join(' or ')} in production.`);
  }

  if (LOCAL_OR_PRIVATE_HOST.test(parsed.hostname)) {
    throw new Error(`${name} points to a local or private network host.`);
  }
}

readDotEnv();

if (runningAsEasHook && easProfile !== 'production') {
  console.log(`Skipping production env check for EAS profile "${easProfile || 'unknown'}".`);
  process.exit(0);
}

const failures = [];
for (const name of REQUIRED_PUBLIC_ENV) {
  try {
    assertPublicUrl(name, process.env[name]);
  } catch (error) {
    failures.push(error.message);
  }
}

if (failures.length) {
  console.error('Production mobile environment is not safe to ship:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production mobile environment is safe to ship.');
