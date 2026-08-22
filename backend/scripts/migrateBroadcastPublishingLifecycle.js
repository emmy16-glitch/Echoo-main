import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Broadcast from '../src/models/Broadcast.js';
import Audio from '../src/models/Audio.js';
import TranscriptSegment from '../src/models/TranscriptSegment.js';

await connectDatabase();
try {
  const broadcasts = await Broadcast.updateMany(
    { visibility: { $exists: false } },
    [{ $set: {
      visibility: { $cond: ['$isPublic', 'public', 'private'] },
      assetVisibility: {
        audio: { $cond: ['$isPublic', 'public', 'private'] },
        transcript: 'private',
      },
      assetStatus: {
        audio: { $cond: [{ $eq: [{ $type: '$replayAudio' }, 'objectId'] }, 'ready', 'pending'] },
        transcript: 'disabled',
        highlights: 'pending',
        chapters: 'pending',
      },
    } }],
    { updatePipeline: true }
  );
  const repairedBroadcastAssets = await Broadcast.updateMany(
    {
      'assetStatus.audio': 'ready',
      $or: [{ replayAudio: null }, { replayAudio: { $exists: false } }],
    },
    [{
      $set: {
        'assetStatus.audio': {
          $cond: [
            { $in: ['$status', ['completed', 'cancelled', 'failed']] },
            'failed',
            'pending',
          ],
        },
        'assetVisibility.audio': 'private',
      },
    }],
    { updatePipeline: true }
  );
  const audio = await Audio.updateMany(
    { visibility: { $exists: false } },
    [{ $set: {
      visibility: { $cond: ['$isPublic', 'public', 'private'] },
      publicationStatus: { $cond: ['$isPublic', 'published', 'draft'] },
      publishedAt: { $cond: ['$isPublic', '$createdAt', null] },
    } }],
    { updatePipeline: true }
  );
  const segments = await TranscriptSegment.updateMany(
    { originalText: { $exists: false } },
    [{ $set: { originalText: '$text', publicationStatus: 'draft' } }],
    { updatePipeline: true }
  );
  console.log(JSON.stringify({
    broadcasts: broadcasts.modifiedCount,
    repairedBroadcastAssets: repairedBroadcastAssets.modifiedCount,
    audio: audio.modifiedCount,
    segments: segments.modifiedCount,
  }));
} finally {
  await disconnectDatabase();
  await mongoose.disconnect().catch(() => null);
}
