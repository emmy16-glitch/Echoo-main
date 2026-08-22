import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { io as createSocketClient } from 'socket.io-client';

const waitFor = async (predicate, message, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
};

const providerToken = `probe-provider-${Date.now()}`;
const provider = new WebSocketServer({ port: 0 });
await once(provider, 'listening');
const providerPort = provider.address().port;
process.env.WHISPER_FLOW_URL = `ws://127.0.0.1:${providerPort}`;
process.env.WHISPER_FLOW_API_KEY = providerToken;

let providerAuthenticated = false;
let providerReceivedPcm = false;
provider.on('connection', (socket, request) => {
  providerAuthenticated = request.headers.authorization === `Bearer ${providerToken}`;
  let emitted = false;
  socket.on('message', (data) => {
    const packet = JSON.parse(data.toString('utf8'));
    if (packet.type === 'start') {
      socket.send(JSON.stringify({ type: 'ready', model: 'medium' }));
      return;
    }
    if (packet.type === 'flush') {
      socket.send(JSON.stringify({ type: 'flushed', lastSequence: packet.lastSequence }));
      return;
    }
    if (packet.type !== 'audio') return;
    providerReceivedPcm = Buffer.from(packet.audioChunk, 'base64').byteLength === 640;
    socket.send(JSON.stringify({ type: 'ack', sequence: packet.sequence }));
    if (emitted) return;
    emitted = true;
    socket.send(JSON.stringify({
      type: 'segment', segmentId: 'probe-segment-1', text: 'Echoo transcription gateway probe',
      startTimeMs: packet.timestamp, endTimeMs: packet.timestamp + 400,
      timebase: 'broadcast', confidence: 0.97, status: 'partial', revision: 1,
    }));
    socket.send(JSON.stringify({
      type: 'segment', segmentId: 'probe-segment-1', text: 'Echoo transcription gateway probe passed.',
      startTimeMs: packet.timestamp, endTimeMs: packet.timestamp + 600,
      timebase: 'broadcast', confidence: 0.99, status: 'final', revision: 2,
    }));
    socket.send(JSON.stringify({
      type: 'segment', segmentId: 'probe-segment-2', text: 'Cursor retrieval also passed the gateway probe.',
      startTimeMs: packet.timestamp + 700, endTimeMs: packet.timestamp + 1100,
      timebase: 'broadcast', confidence: 0.98, status: 'final', revision: 1,
    }));
  });
});

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { generateAccessToken } = await import('../src/config/jwt.js');
const { server } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Station } = await import('../src/models/Station.js');
const { default: Broadcast } = await import('../src/models/Broadcast.js');
const { default: Audio } = await import('../src/models/Audio.js');
const { default: TranscriptSession } = await import('../src/models/TranscriptSession.js');
const { default: TranscriptSegment } = await import('../src/models/TranscriptSegment.js');

let socket = null;
let user = null;
let station = null;
let broadcast = null;
let audio = null;

try {
  await connectDatabase();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  user = await User.create({
    username: `transcript_probe_${suffix}`.slice(0, 30),
    email: `transcript-probe-${suffix}@echoo.invalid`,
    passwordHash: 'not-used-by-transcription-probe',
    displayName: 'Transcription Probe',
    roles: ['creator'],
    userType: 'creator',
  });
  station = await Station.create({
    name: 'Transcription Probe Station',
    slug: `transcript-probe-${suffix}`,
    owner: user._id,
  });
  const startedAt = new Date(Date.now() - 5000);
  broadcast = await Broadcast.create({
    title: 'Transcription Gateway Probe',
    station: station._id,
    creator: user._id,
    startTime: startedAt,
    endTime: new Date(Date.now() + 60 * 60 * 1000),
    startedAt,
    status: 'live',
    isPublic: true,
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const apiPort = server.address().port;
  const apiBase = `http://127.0.0.1:${apiPort}/api`;
  const token = generateAccessToken({
    userId: user._id,
    email: user.email,
    roles: user.roles,
  });

  const sessionResponse = await fetch(`${apiBase}/transcripts/broadcast/${broadcast._id}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'en' }),
  });
  assert.equal(sessionResponse.status, 201);
  const sessionPayload = await sessionResponse.json();
  const sessionId = sessionPayload.data.session.id;
  assert.ok(sessionPayload.data.session.offsetMs >= 4000);

  socket = createSocketClient(`http://127.0.0.1:${apiPort}`, {
    auth: { token },
    transports: ['websocket'],
  });
  await once(socket, 'connect');
  const emitAck = (event, payload) => new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
  assert.equal((await emitAck('broadcast:join', { broadcastId: String(broadcast._id) })).ok, true);
  assert.equal((await emitAck('transcription:attach', { sessionId })).ok, true);

  const realtimeSegments = [];
  socket.on('transcript:segment', (segment) => { realtimeSegments.push(segment); });
  const pcmAck = await emitAck('transcription:pcm', {
    sessionId,
    frameIndex: 0,
    data: Buffer.alloc(640),
  });
  assert.equal(pcmAck.ok, true);

  const finalSegment = await waitFor(
    () => TranscriptSegment.findOne({ sessionId, isFinal: true }),
    'The provider final segment was not persisted'
  );
  assert.equal(providerAuthenticated, true);
  assert.equal(providerReceivedPcm, true);
  assert.equal(finalSegment.text, 'Echoo transcription gateway probe passed.');
  assert.equal(finalSegment.confidence, 0.99);
  assert.ok(finalSegment.startMs >= 4000);
  await waitFor(
    () => realtimeSegments.filter((segment) => segment.isFinal).length >= 2,
    'Realtime final segments were not emitted'
  );

  audio = await Audio.create({
    title: 'Transcription Gateway Probe Replay',
    artist: user._id,
    filename: `transcript-probe-${suffix}.wav`,
    originalName: 'transcript-probe.wav',
    fileSize: 640,
    fileUrl: `/uploads/audio/transcript-probe-${suffix}.wav`,
    fileKey: `transcript-probe-${suffix}.wav`,
    mimeType: 'audio/wav',
    duration: 2,
    genre: 'Other',
    isPublic: true,
    sourceBroadcast: broadcast._id,
  });
  await TranscriptSegment.updateMany(
    { broadcastId: broadcast._id, isFinal: true },
    { $set: { audioId: audio._id } }
  );
  const replaySearchResponse = await fetch(
    `${apiBase}/transcripts/search?search=gateway&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(replaySearchResponse.status, 200);
  const replaySearch = await replaySearchResponse.json();
  assert.equal(replaySearch.data[0].replay.title, 'Transcription Gateway Probe Replay');
  assert.ok(replaySearch.data[0].startTime >= 4);

  const firstPageResponse = await fetch(
    `${apiBase}/transcripts/broadcast/${broadcast._id}?search=gateway&final=true&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(firstPageResponse.status, 200);
  const firstPage = await firstPageResponse.json();
  assert.equal(firstPage.data.length, 1);
  assert.equal(firstPage.pagination.hasMore, true);
  assert.ok(firstPage.pagination.nextCursor);
  const secondPageResponse = await fetch(
    `${apiBase}/transcripts/broadcast/${broadcast._id}?search=gateway&final=true&limit=1&cursor=${encodeURIComponent(firstPage.pagination.nextCursor)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(secondPageResponse.status, 200);
  const secondPage = await secondPageResponse.json();
  assert.equal(secondPage.data.length, 1);
  assert.notEqual(secondPage.data[0].id, firstPage.data[0].id);

  const flushAck = await emitAck('transcription:flush', { sessionId });
  assert.equal(flushAck.ok, true);
  const completed = await TranscriptSession.findById(sessionId);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.lastAcknowledgedFrame, 0);

  console.log('Transcription gateway probe passed:', {
    authenticatedProvider: providerAuthenticated,
    pcmBytes: 640,
    sessionOffsetMs: sessionPayload.data.session.offsetMs,
    persistedFinal: finalSegment.text,
    realtimeFinalEvents: realtimeSegments.filter((segment) => segment.isFinal).length,
    cursorPagination: `${firstPage.data.length}+${secondPage.data.length}`,
    replaySearch: replaySearch.data[0].replay.title,
    sessionState: completed.state,
  });
} finally {
  socket?.disconnect();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  for (const client of provider.clients) client.terminate();
  await new Promise((resolve) => provider.close(resolve));
  if (broadcast) {
    await TranscriptSegment.deleteMany({ broadcastId: broadcast._id }).catch(() => null);
    await TranscriptSession.deleteMany({ broadcastId: broadcast._id }).catch(() => null);
    await Broadcast.deleteOne({ _id: broadcast._id }).catch(() => null);
  }
  if (audio) await Audio.deleteOne({ _id: audio._id }).catch(() => null);
  if (station) await Station.deleteOne({ _id: station._id }).catch(() => null);
  if (user) await User.deleteOne({ _id: user._id }).catch(() => null);
  await disconnectDatabase().catch(() => null);
}
