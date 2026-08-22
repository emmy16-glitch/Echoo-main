import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Audio from '../src/models/Audio.js';
import Broadcast from '../src/models/Broadcast.js';
import TranscriptSegment from '../src/models/TranscriptSegment.js';
import SavedMoment from '../src/models/SavedMoment.js';
import TranscriptSession from '../src/models/TranscriptSession.js';

async function assertReplayUniqueness() {
  const duplicates = await Audio.aggregate([
    { $match: { sourceBroadcast: { $type: 'objectId' }, isDeleted: false } },
    { $group: { _id: '$sourceBroadcast', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (duplicates.length) {
    throw new Error(
      `Replay migration stopped: duplicate Audio.sourceBroadcast values require review: ${duplicates
        .map((item) => `${item._id} (${item.count})`)
        .join(', ')}`
    );
  }
}

async function migrate() {
  await connectDatabase();
  await assertReplayUniqueness();

  await Promise.all([
    TranscriptSession.createCollection().catch((error) => {
      if (error?.codeName !== 'NamespaceExists') throw error;
    }),
    TranscriptSegment.createCollection().catch((error) => {
      if (error?.codeName !== 'NamespaceExists') throw error;
    }),
    SavedMoment.createCollection().catch((error) => {
      if (error?.codeName !== 'NamespaceExists') throw error;
    }),
    Audio.createCollection().catch((error) => {
      if (error?.codeName !== 'NamespaceExists') throw error;
    }),
    Broadcast.createCollection().catch((error) => {
      if (error?.codeName !== 'NamespaceExists') throw error;
    }),
  ]);

  await TranscriptSegment.updateMany(
    { sessionId: { $exists: false } },
    { $set: { sessionId: null } }
  );
  const legacyBroadcastIds = await TranscriptSegment.distinct('broadcastId', {
    sessionId: null,
  });
  for (const broadcastId of legacyBroadcastIds) {
    const broadcast = await Broadcast.findById(broadcastId)
      .select('creator startTime startedAt endTime endedAt')
      .lean();
    if (!broadcast?.creator) continue;
    const session = await TranscriptSession.findOneAndUpdate(
      { broadcastId, provider: 'legacy-import' },
      {
        $setOnInsert: {
          creatorId: broadcast.creator,
          state: 'completed',
          status: 'completed',
          provider: 'legacy-import',
          model: 'legacy',
          startedAt: broadcast.startedAt || broadcast.startTime || new Date(),
          endedAt: broadcast.endedAt || broadcast.endTime || new Date(),
          lastActivityAt: broadcast.endedAt || broadcast.endTime || new Date(),
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    await TranscriptSegment.updateMany(
      { broadcastId, sessionId: null },
      { $set: { sessionId: session._id, provider: 'legacy-import' } }
    );
  }
  await TranscriptSegment.updateMany(
    { confidence: { $exists: false } },
    { $set: { confidence: null } }
  );
  await TranscriptSegment.updateMany(
    { providerRevision: { $exists: false } },
    { $set: { providerRevision: 0 } }
  );
  await TranscriptSegment.updateMany(
    { sourceType: { $exists: false } },
    { $set: { sourceType: 'final_mix', sourceLabel: 'Echoo final mix' } }
  );
  await TranscriptSegment.updateMany(
    { isHighlighted: { $exists: false } },
    { $set: { isHighlighted: false, isPinned: false, isHidden: false } }
  );
  await TranscriptSegment.updateMany(
    { status: { $exists: false }, isFinal: true },
    { $set: { status: 'final' } }
  );
  await TranscriptSegment.updateMany(
    { status: { $exists: false }, isFinal: { $ne: true } },
    { $set: { status: 'partial' } }
  );
  await TranscriptSession.updateMany(
    { status: { $exists: false }, state: 'completed' },
    { $set: { status: 'completed' } }
  );
  await Broadcast.updateMany(
    { mediaState: { $exists: false }, status: 'live' },
    { $set: { mediaState: 'creator_connecting' } }
  );
  await Broadcast.updateMany(
    { mediaState: { $exists: false }, status: { $in: ['completed', 'cancelled', 'failed'] } },
    { $set: { mediaState: 'audio_disconnected' } }
  );
  await Broadcast.updateMany(
    { mediaState: { $exists: false } },
    { $set: { mediaState: 'waiting_for_creator' } }
  );
  await Broadcast.updateMany(
    { transcriptState: { $exists: false } },
    { $set: { transcriptState: 'disabled' } }
  );
  await Broadcast.updateMany(
    { audioSources: { $exists: false } },
    { $set: { audioSources: [] } }
  );
  await Broadcast.updateMany(
    { audioConfiguration: { $exists: false } },
    {
      $set: {
        audioConfiguration: {
          audioMode: 'enhanced',
          noiseReduction: 0.45,
          echoRemoval: true,
          voiceWarmth: 0.35,
          voiceClarity: 0.45,
          deEsser: 0.3,
          volumeBalance: 0.45,
          protectLoudSounds: true,
          masterVolume: 1,
        },
      },
    }
  );
  await Broadcast.updateMany(
    { captionSettings: { $exists: false } },
    { $set: { captionSettings: { showToListeners: true, language: 'en', autoPublishCorrections: true, delayMs: 0 } } }
  );
  await Broadcast.updateMany(
    { listenerSeconds: { $exists: false } },
    { $set: { listenerSeconds: 0, lastPresenceSampleAt: null, savedMoments: [], mutedChatUsers: [] } }
  );
  await TranscriptSession.updateMany(
    { status: { $exists: false }, state: { $in: ['failed', 'abandoned'] } },
    { $set: { status: 'failed' } }
  );
  await TranscriptSession.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'active' } }
  );
  await TranscriptSession.updateMany(
    { captureOffset: { $exists: false } },
    [{ $set: { captureOffset: { $ifNull: ['$offsetMs', 0] } } }],
    { updatePipeline: true }
  );

  const collection = mongoose.connection.collection('echoo_transcript_segments');
  const indexes = await collection.indexes();
  const oldUnique = indexes.find((index) => index.name === 'broadcastId_1_providerSegmentId_1');
  if (oldUnique) await collection.dropIndex(oldUnique.name);

  const audioCollection = mongoose.connection.collection('echoo_audios');
  const audioIndexes = await audioCollection.indexes();
  const oldReplayIndex = audioIndexes.find((index) =>
    index.name === 'sourceBroadcast_1' &&
    (!index.unique || !index.partialFilterExpression)
  );
  if (oldReplayIndex) await audioCollection.dropIndex(oldReplayIndex.name);

  // createIndexes is deliberately additive. The migration removes only the two
  // superseded key definitions above and leaves operator-managed indexes alone.
  await TranscriptSession.createIndexes();
  await TranscriptSegment.createIndexes();
  await SavedMoment.createIndexes();
  await Audio.createIndexes();
  await Broadcast.createIndexes();
  console.log('Transcription architecture migration complete.');
}

migrate()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
