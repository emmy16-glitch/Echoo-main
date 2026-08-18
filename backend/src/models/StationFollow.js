import mongoose from 'mongoose';

const stationFollowSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

stationFollowSchema.index(
  { follower: 1, station: 1 },
  { unique: true }
);
stationFollowSchema.index({ follower: 1, createdAt: -1 });
stationFollowSchema.index({ station: 1, createdAt: -1 });

const StationFollow = mongoose.model(
  'StationFollow',
  stationFollowSchema,
  'echoo_station_follows'
);

export default StationFollow;
