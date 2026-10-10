import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Audio from '../models/Audio.js';

// Intent is inferred only from the explicit legacy isPublic flag. Collection
// or Channel membership is never used to publish a recording.
export async function migrateAudioPublicationConsistency({ dryRun = false } = {}) {
  const publishedFilter = {
    isPublic: true,
    $or: [
      { visibility: { $ne: 'public' } },
      { publicationStatus: { $ne: 'published' } },
      { publishedAt: null },
    ],
  };
  const privateFilter = {
    isPublic: { $ne: true },
    $or: [
      { visibility: 'public' },
      { publicationStatus: 'published' },
      { publishedAt: { $ne: null } },
    ],
  };
  const [publishCount, privateCount] = await Promise.all([
    Audio.collection.countDocuments(publishedFilter),
    Audio.collection.countDocuments(privateFilter),
  ]);
  if (dryRun) return { publishCount, privateCount, changed: 0 };

  const now = new Date();
  const [published, unpublished] = await Promise.all([
    Audio.collection.updateMany(publishedFilter, [{
      $set: {
        visibility: 'public',
        publicationStatus: 'published',
        publishedAt: { $ifNull: ['$publishedAt', { $ifNull: ['$createdAt', now] }] },
      },
    }]),
    Audio.collection.updateMany(privateFilter, {
      $set: { visibility: 'private', publicationStatus: 'draft', publishedAt: null },
    }),
  ]);
  return { publishCount, privateCount, changed: published.modifiedCount + unpublished.modifiedCount };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const dryRun = process.argv.includes('--dry-run');
    console.log(JSON.stringify({ dryRun, ...(await migrateAudioPublicationConsistency({ dryRun })) }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });
}
