import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Station from '../src/models/Station.js';
import Broadcast from '../src/models/Broadcast.js';

const REPAIR_STATION_NAME = /^Echoo Repair Station(?:\s|$)/i;
const REPAIR_BROADCAST_TITLE = /^Echoo Live Repair Test(?:\s|$)/i;
const REPAIR_DESCRIPTION = /Echoo backend integration test/i;

async function removeRepairTestData() {
  await connectDatabase();

  try {
    const testStations = await Station.find({
      isDeleted: false,
      $or: [
        { name: REPAIR_STATION_NAME },
        { description: REPAIR_DESCRIPTION },
      ],
    }).select('_id name description');

    const stationIds = testStations.map((station) => station._id);

    const broadcastFilter = {
      isDeleted: false,
      $or: [
        { title: REPAIR_BROADCAST_TITLE },
        ...(stationIds.length ? [{ station: { $in: stationIds } }] : []),
      ],
    };

    const broadcasts = await Broadcast.find(broadcastFilter).select(
      '_id title status station'
    );

    if (!testStations.length && !broadcasts.length) {
      console.log('No Echoo repair-test data found. Nothing changed.');
      return;
    }

    if (broadcasts.length) {
      await Broadcast.updateMany(
        { _id: { $in: broadcasts.map((broadcast) => broadcast._id) } },
        {
          $set: {
            isDeleted: true,
            status: 'cancelled',
            listenerCount: 0,
            endedAt: new Date(),
          },
        }
      );
    }

    if (testStations.length) {
      await Station.updateMany(
        { _id: { $in: stationIds } },
        {
          $set: {
            isDeleted: true,
            isLive: false,
            listenerCount: 0,
          },
        }
      );
    }

    console.log(
      `Removed ${testStations.length} repair-test station(s) and ${broadcasts.length} repair-test broadcast(s).`
    );

    for (const station of testStations) {
      console.log(`  station: ${station.name}`);
    }

    for (const broadcast of broadcasts) {
      console.log(`  broadcast: ${broadcast.title}`);
    }
  } finally {
    await disconnectDatabase();
  }
}

removeRepairTestData().catch((error) => {
  console.error('Could not remove Echoo repair-test data:', error);
  process.exitCode = 1;
});
