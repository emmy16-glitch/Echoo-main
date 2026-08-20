import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import User from '../models/User.js';

const invalidAudioId = (res) =>
  res.status(400).json({
    error: { code: 'INVALID_AUDIO_ID', message: 'Invalid audio ID' },
  });

const sameId = (first, second) =>
  Boolean(first && second && String(first) === String(second));

// Audio likes are a per-user relationship, not an unbounded counter endpoint.
// User.likedAudio is the authoritative relationship and Audio.likeCount is a
// denormalized counter kept in sync with the relationship transition.
export async function toggleAudioLike(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidAudioId(res);

    const [audio, user] = await Promise.all([
      Audio.findOne({
        _id: id,
        isDeleted: false,
        isPublic: true,
      }),
      User.findById(req.userId).select('_id likedAudio'),
    ]);

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const alreadyLiked = (user.likedAudio || []).some((audioId) =>
      sameId(audioId, audio._id)
    );

    if (alreadyLiked) {
      const relationship = await User.updateOne(
        { _id: user._id, likedAudio: audio._id },
        { $pull: { likedAudio: audio._id } }
      );

      if (relationship.modifiedCount > 0) {
        try {
          await audio.decrementLikes();
        } catch (counterError) {
          // Keep the relationship/counter transition atomic from the API's
          // perspective even on standalone MongoDB deployments where a real
          // transaction may not be available.
          await User.updateOne(
            { _id: user._id },
            { $addToSet: { likedAudio: audio._id } }
          ).catch(() => null);
          throw counterError;
        }
      }

      const current = await Audio.findById(audio._id).select('likeCount');
      return res.status(200).json({
        data: {
          liked: false,
          likeCount: Math.max(0, Number(current?.likeCount) || 0),
        },
        timestamp: new Date().toISOString(),
      });
    }

    const relationship = await User.updateOne(
      { _id: user._id, likedAudio: { $ne: audio._id } },
      { $addToSet: { likedAudio: audio._id } }
    );

    if (relationship.modifiedCount > 0) {
      try {
        await audio.incrementLikes();
      } catch (counterError) {
        await User.updateOne(
          { _id: user._id },
          { $pull: { likedAudio: audio._id } }
        ).catch(() => null);
        throw counterError;
      }
    }

    const current = await Audio.findById(audio._id).select('likeCount');
    return res.status(200).json({
      data: {
        liked: true,
        likeCount: Math.max(0, Number(current?.likeCount) || 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export default {
  toggleAudioLike,
};
