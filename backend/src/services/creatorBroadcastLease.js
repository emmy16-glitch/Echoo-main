import mongoose from 'mongoose';

const leaseHours = Math.max(
  1,
  Math.min(48, Number.parseInt(process.env.CREATOR_BROADCAST_LEASE_HOURS || '24', 10) || 24)
);

const creatorBroadcastLeaseSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    broadcast: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

creatorBroadcastLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CreatorBroadcastLease =
  mongoose.models.CreatorBroadcastLease ||
  mongoose.model(
    'CreatorBroadcastLease',
    creatorBroadcastLeaseSchema,
    'echoo_creator_broadcast_leases'
  );

const nextExpiry = () => new Date(Date.now() + leaseHours * 60 * 60 * 1000);

const alreadyLiveError = (lease = null) => {
  const error = new Error(
    'You already have an active live broadcast. End it before starting another.'
  );
  error.code = 'CREATOR_ALREADY_LIVE';
  error.status = 409;
  error.activeBroadcastId = lease?.broadcast ? String(lease.broadcast) : null;
  return error;
};

export async function acquireCreatorBroadcastLease(creatorId, broadcastId) {
  const creator = new mongoose.Types.ObjectId(String(creatorId));
  const broadcast = new mongoose.Types.ObjectId(String(broadcastId));
  const now = new Date();

  try {
    const lease = await CreatorBroadcastLease.findOneAndUpdate(
      {
        creator,
        $or: [
          { broadcast },
          { expiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          broadcast,
          expiresAt: nextExpiry(),
        },
      },
      {
        returnDocument: 'after',
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return lease;
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const existing = await CreatorBroadcastLease.findOne({ creator })
      .select('broadcast expiresAt')
      .lean();
    throw alreadyLiveError(existing);
  }
}

export async function refreshCreatorBroadcastLease(creatorId, broadcastId) {
  return acquireCreatorBroadcastLease(creatorId, broadcastId);
}

export async function releaseCreatorBroadcastLease(creatorId, broadcastId = null) {
  const filter = { creator: creatorId };
  if (broadcastId) filter.broadcast = broadcastId;
  await CreatorBroadcastLease.deleteOne(filter);
}

export async function getCreatorBroadcastLease(creatorId) {
  return CreatorBroadcastLease.findOne({
    creator: creatorId,
    expiresAt: { $gt: new Date() },
  })
    .select('creator broadcast expiresAt')
    .lean();
}

export { CreatorBroadcastLease };
