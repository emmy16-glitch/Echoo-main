import assert from 'node:assert/strict';
import test from 'node:test';
import { broadcastLike } from '../src/controllers/broadcastLikeController.js';
import Broadcast from '../src/models/Broadcast.js';
import User from '../src/models/User.js';

const id = '507f1f77bcf86cd799439031';
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('likes use authenticated account ownership and idempotent atomic updates', async () => {
  const original = [Broadcast.findOne, User.findByIdAndUpdate, User.findById];
  const accounts = new Map();
  Broadcast.findOne = filter => ({ select: async () => { assert.equal(filter.isPublic, true); return { _id: id }; } });
  User.findByIdAndUpdate = (userId, update) => ({ select: async () => {
    const likedBroadcasts = new Set(accounts.get(userId) || []);
    if (update.$addToSet) likedBroadcasts.add(update.$addToSet.likedBroadcasts);
    if (update.$pull) likedBroadcasts.delete(update.$pull.likedBroadcasts);
    accounts.set(userId, [...likedBroadcasts]);
    return { likedBroadcasts: [...likedBroadcasts] };
  } });
  User.findById = userId => ({ select: async () => ({ likedBroadcasts: accounts.get(userId) || [] }) });
  try {
    for (const method of ['PUT', 'PUT']) { const res = response(); await broadcastLike({ method, userId: 'alice', params: { broadcastId: id } }, res, error => { throw error; }); assert.equal(res.body.data.liked, true); }
    assert.equal(accounts.get('alice').length, 1);
    let res = response(); await broadcastLike({ method: 'GET', userId: 'bob', params: { broadcastId: id } }, res, error => { throw error; }); assert.equal(res.body.data.liked, false);
    res = response(); await broadcastLike({ method: 'DELETE', userId: 'alice', params: { broadcastId: id } }, res, error => { throw error; }); assert.equal(res.body.data.liked, false);
    res = response(); await broadcastLike({ method: 'PUT', userId: 'alice', params: { broadcastId: 'invalid' } }, res, error => { throw error; }); assert.equal(res.code, 400);
    Broadcast.findOne = () => ({ select: async () => null });
    res = response(); await broadcastLike({ method: 'PUT', userId: 'alice', params: { broadcastId: id } }, res, error => { throw error; }); assert.equal(res.code, 404);
  } finally { [Broadcast.findOne, User.findByIdAndUpdate, User.findById] = original; }
});
