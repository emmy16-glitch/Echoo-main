import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), 'VITE_');
const problems = [];

const apiUrl = String(env.VITE_API_URL || process.env.VITE_API_URL || '').trim();
const liveKitUrl = String(env.VITE_LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || '').trim();

if (!apiUrl) {
  problems.push('VITE_API_URL is missing.');
} else {
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== 'https:') {
      problems.push('VITE_API_URL must use https:// for public testing.');
    }
    if (!/\/api\/?$/.test(parsed.pathname)) {
      problems.push('VITE_API_URL must end with /api.');
    }
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
      problems.push('VITE_API_URL cannot point to localhost for a public Cloudflare deployment.');
    }
  } catch {
    problems.push('VITE_API_URL is not a valid URL.');
  }
}

if (!liveKitUrl) {
  problems.push('VITE_LIVEKIT_URL is missing.');
} else {
  try {
    const parsed = new URL(liveKitUrl);
    if (parsed.protocol !== 'wss:') {
      problems.push('VITE_LIVEKIT_URL must use wss:// for a public HTTPS frontend.');
    }
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
      problems.push('VITE_LIVEKIT_URL cannot point to localhost for public testing.');
    }
  } catch {
    problems.push('VITE_LIVEKIT_URL is not a valid WebSocket URL.');
  }
}

if (problems.length) {
  console.error('\nEchoo Cloudflare deployment preflight failed:\n');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('\nSet the values in frontend/.env.production or in Cloudflare Pages environment variables, then deploy again.\n');
  process.exit(1);
}

console.log('Echoo Cloudflare deployment preflight passed.');
console.log(`API: ${apiUrl}`);
console.log(`LiveKit: ${liveKitUrl}`);
