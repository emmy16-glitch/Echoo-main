import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import User from '../src/models/User.js';

const defaults = {
  audioMode: 'enhanced',
  noiseReduction: 45,
  echoRemoval: true,
  voiceWarmth: 35,
  voiceClarity: 45,
  deEsser: 30,
  volumeBalance: 45,
  protectLoudSounds: true,
  masterVolume: 100,
};

try {
  await connectDatabase();
  const result = await User.updateMany(
    {
      userType: 'creator',
      'preferences.creatorAudio': { $exists: false },
    },
    { $set: { 'preferences.creatorAudio': defaults } }
  );
  console.log('Creator audio preferences migration complete', {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
} finally {
  await disconnectDatabase();
}
