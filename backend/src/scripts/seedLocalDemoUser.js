import mongoose from 'mongoose';
import { env } from '../config/env.js';
import User from '../models/User.js';

const isLocalEchooDatabase = (uri) => {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'mongodb:' &&
      ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) &&
      (parsed.port || '27017') === '27017' &&
      parsed.pathname === '/echoo' &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
};

const failIfUnsafe = () => {
  if (env.nodeEnv !== 'development' || !isLocalEchooDatabase(env.mongodbUri)) {
    throw new Error(
      'Refusing to seed. This command only runs with NODE_ENV=development and a local mongodb://127.0.0.1:27017/echoo-style URI.'
    );
  }
};

const username = String(process.env.ECHOO_DEMO_USERNAME || 'echoodemo').trim();
const email = String(process.env.ECHOO_DEMO_EMAIL || 'demo@echoo.local').trim().toLowerCase();
const password = String(process.env.ECHOO_DEMO_PASSWORD || 'EchooDemo2026!');
const displayName = String(process.env.ECHOO_DEMO_DISPLAY_NAME || 'Echoo Demo').trim();

async function seedLocalDemoUser() {
  failIfUnsafe();

  if (!username || !email || !displayName || password.length < 6) {
    throw new Error('Demo account values are invalid. Username, email, display name, and a 6+ character password are required.');
  }

  await mongoose.connect(env.mongodbUri);
  try {
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      console.log(`Local demo account already exists: ${existing.username} (${existing.email})`);
      return;
    }

    const passwordHash = await User.hashPassword(password);
    await User.create({
      username,
      email,
      passwordHash,
      displayName,
      roles: ['creator'],
      userType: 'creator',
      onboardingStep: 4,
      onboardingCompleted: true,
      creatorProfile: {
        creatorType: 'individual',
        artistName: displayName,
        category: 'Podcast',
        about: 'Local Echoo presentation account.',
      },
      isActive: true,
    });

    console.log('Created local development-only Echoo presentation account.');
    console.log(`Username: ${username}`);
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
  } finally {
    await mongoose.disconnect();
  }
}

seedLocalDemoUser().catch((error) => {
  console.error(`Local demo seed failed: ${error.message}`);
  process.exitCode = 1;
});
