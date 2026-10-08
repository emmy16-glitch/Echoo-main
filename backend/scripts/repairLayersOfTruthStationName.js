// A one-time, dry-run-first repair for the misnamed Layers of Truth Channel.
// Never execute automatically on application boot, during deployment, or in CI.
// Requires the real Echoo backend environment and its production MongoDB URI.
// Preview: node scripts/repairLayersOfTruthStationName.js
// Apply:   node scripts/repairLayersOfTruthStationName.js --apply --database=DB_NAME
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Station from '../src/models/Station.js';

const STATION_ID = '6a8b855ee44947dd85312d64';
const EXPECTED_OWNER = '6a8aa169e44947dd85312d5c';
const ORIGINAL_NAME = 'Tuesday Bible Study - 06th Oct, 2026';
const ORIGINAL_SLUG = 'tuesday-bible-study-06th-oct-2026';
const CORRECT_NAME = 'Layers of Truth';
const CORRECT_SLUG = 'layers-of-truth';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirmedDatabase = args.find((value) => value.startsWith('--database='))?.slice('--database='.length);
if (args.some((value) => value !== '--apply' && !value.startsWith('--database='))) {
  throw new Error('Unsupported argument. Use --apply --database=NAME, or no arguments to preview.');
}

await connectDatabase();
try {
  const db = mongoose.connection.db.databaseName;
  console.log('Echoo database:', db, 'Mode:', apply ? 'UPDATE ONE STATION' : 'READ-ONLY PREVIEW');
  const id = new mongoose.Types.ObjectId(STATION_ID);
  const owner = new mongoose.Types.ObjectId(EXPECTED_OWNER);
  const station = await Station.collection.findOne({ _id: id }, {
    projection: { _id: 1, owner: 1, name: 1, slug: 1, updatedAt: 1, isDeleted: 1 },
  });
  if (!station) throw new Error('The expected Channel is missing. No changes made.');
  if (String(station.owner) !== EXPECTED_OWNER) throw new Error('Channel owner mismatch. No changes made.');
  if (station.isDeleted) throw new Error('Channel is already deleted. No changes made.');
  if (station.name === CORRECT_NAME && station.slug === CORRECT_SLUG) {
    console.log('Already corrected. No changes necessary.');
  } else {
    if (station.name !== ORIGINAL_NAME || station.slug !== ORIGINAL_SLUG) {
      throw new Error('Channel was renamed or changed. Stop for manual review.');
    }
    const conflicting = await Station.collection.findOne({
      slug: CORRECT_SLUG, isDeleted: false, _id: { $ne: id },
    }, { projection: { _id: 1 } });
    if (conflicting) throw new Error('Layers of Truth slug already belongs to another active Channel.');

    console.log('Channel ID:', STATION_ID);
    console.log('Existing Channel name:', ORIGINAL_NAME);
    console.log('New permanent Channel name:', CORRECT_NAME);
    console.log('Broadcast titles and recordings will not be modified.');
    if (apply) {
      if (confirmedDatabase !== db) throw new Error('Database name confirmation mismatch; no changes made.');
      const result = await Station.collection.updateOne({
        _id: id,
        owner,
        name: ORIGINAL_NAME,
        slug: ORIGINAL_SLUG,
        isDeleted: false,
        updatedAt: station.updatedAt,
      }, { $set: {
        name: CORRECT_NAME,
        slug: CORRECT_SLUG,
        updatedAt: new Date(),
      } });
      if (result.modifiedCount !== 1) throw new Error('Channel changed concurrently; no changes made.');
      const verified = await Station.collection.findOne({ _id: id }, { projection: { name: 1, slug: 1 } });
      if (verified?.name !== CORRECT_NAME || verified?.slug !== CORRECT_SLUG) {
        throw new Error('Post-update verification failed; inspect the database before proceeding.');
      }
      console.log('SUCCESS: Station repaired; owner, broadcasts and recordings untouched.');
    } else {
      console.log('DRY RUN ONLY. Run with --apply --database=' + db + ' after checking production database.');
    }
  }
} finally {
  await disconnectDatabase();
}
