import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';

export async function broadcastLike(req, res, next) {
  try {
    const id = req.params.broadcastId;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: { message: 'Invalid broadcast ID' } });
    const broadcast = await Broadcast.findOne({ _id: id, isPublic: true, isDeleted: { $ne: true } }).select('_id');
    if (!broadcast) return res.status(404).json({ error: { message: 'Public broadcast not found' } });
    const user = req.method === 'GET'
      ? await User.findById(req.userId).select('likedBroadcasts')
      : await User.findByIdAndUpdate(req.userId, req.method === 'PUT' ? { $addToSet: { likedBroadcasts: id } } : { $pull: { likedBroadcasts: id } }, { returnDocument: 'after' }).select('likedBroadcasts');
    if (!user) return res.status(404).json({ error: { message: 'Account not found' } });
    return res.json({ data: { liked: (user.likedBroadcasts || []).some(value => String(value) === String(id)) } });
  } catch (error) { next(error); }
}
