import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import Broadcast from '../models/Broadcast.js';
import LiveKitProvider from '../providers/livekit.js';
import { assertFfmpegAvailable } from './audioTrimService.js';
import { getReplayOutputFile } from './broadcastOutputService.js';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const PCM_FORMAT = 's16le';
const RECORDING_PATH = '/api/internal/livekit-recording';
const SIGNATURE_TTL_MS = 5 * 60 * 1000;
const STOP_TIMEOUT_MS = 8_000;
const sessions = new Map();
const startPromises = new Map();
const expectedTracks = new Map();
const desiredTracks = new Map();
const TRACK_HANDOFF_TIMEOUT_MS = 12_000;
const MAX_PENDING_PCM_BYTES = 8 * 1024 * 1024;
let websocketServer = null;
let attachedHttpServer = null;
let upgradeHandler = null;

const enabled = (name) =>
  /^(1|true|yes)$/i.test(String(process.env[name] || '').trim());

const safeId = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');

const bitrate = () => {
  const raw = String(process.env.AUDIO_REPLAY_MP3_BITRATE || '320k').trim() || '320k';
  return /^\d+k$/i.test(raw) ? raw.toLowerCase() : '320k';
};

const ffmpegPath = () =>
  String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';

const serverlessRuntime = () =>
  process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL?.trim());

const recordingBaseUrl = () => {
  const explicit = String(process.env.LIVEKIT_RECORDING_WS_URL || '').trim();
  const source = explicit || String(process.env.FRONTEND_URL || '').trim();
  if (!source) return null;

  try {
    const url = new URL(source);
    url.pathname = RECORDING_PATH;
    url.search = '';
    url.hash = '';
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (!['ws:', 'wss:'].includes(url.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'wss:') return null;
    return url;
  } catch {
    return null;
  }
};

const signingSecret = () => String(process.env.LIVEKIT_API_SECRET || '').trim();

const signaturePayload = ({ broadcastId, trackSid, expiresAt }) =>
  `${broadcastId}|${trackSid}|${expiresAt}`;

const sign = (payload) =>
  createHmac('sha256', signingSecret()).update(payload).digest('hex');

const safeEqual = (left, right) => {
  try {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export const getLiveKitServerRecordingDiagnostics = () => {
  const url = recordingBaseUrl();
  return {
    enabled: enabled('LIVEKIT_SERVER_RECORDING_ENABLED'),
    configured: Boolean(url && signingSecret()),
    available: Boolean(
      enabled('LIVEKIT_SERVER_RECORDING_ENABLED') &&
      url &&
      signingSecret() &&
      !serverlessRuntime()
    ),
    websocketPath: RECORDING_PATH,
    serverlessRuntime: serverlessRuntime(),
  };
};

export const isLiveKitServerRecordingEnabled = () =>
  getLiveKitServerRecordingDiagnostics().available;

const buildSignedRecordingUrl = ({ broadcastId, trackSid }) => {
  const url = recordingBaseUrl();
  if (!url || !signingSecret()) {
    const error = new Error(
      'LiveKit server recording needs LIVEKIT_RECORDING_WS_URL (or FRONTEND_URL) and LIVEKIT_API_SECRET.'
    );
    error.code = 'LIVEKIT_RECORDING_CONFIG_MISSING';
    throw error;
  }

  const expiresAt = Date.now() + SIGNATURE_TTL_MS;
  const payload = signaturePayload({ broadcastId, trackSid, expiresAt });
  url.searchParams.set('broadcastId', String(broadcastId));
  url.searchParams.set('trackSid', String(trackSid));
  url.searchParams.set('expiresAt', String(expiresAt));
  url.searchParams.set('signature', sign(payload));
  return url.toString();
};

const validateRecordingRequest = (request) => {
  const base = new URL(request.url || '/', 'http://echoo.internal');
  const broadcastId = safeId(base.searchParams.get('broadcastId'));
  const trackSid = safeId(base.searchParams.get('trackSid'));
  const expiresAt = Number(base.searchParams.get('expiresAt'));
  const signature = String(base.searchParams.get('signature') || '');
  if (!broadcastId || !trackSid || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }
  const payload = signaturePayload({ broadcastId, trackSid, expiresAt });
  if (!safeEqual(signature, sign(payload))) return null;
  return { broadcastId, trackSid };
};

const persist = async (broadcastId, patch) => {
  await Broadcast.updateOne(
    { _id: broadcastId },
    { $set: patch }
  ).catch((error) => {
    console.warn('[Echoo Server Recording] metadata update failed:', error?.message || error);
  });
};

const writeWithBackpressure = async (child, buffer) => {
  if (!buffer?.length || !child?.stdin || child.stdin.destroyed) return;
  if (child.stdin.write(buffer)) return;
  await new Promise((resolve, reject) => {
    child.stdin.once('drain', resolve);
    child.stdin.once('error', reject);
  });
};

const createSession = async (broadcastId) => {
  const replay = getReplayOutputFile(broadcastId);
  if (!replay?.path) throw new Error('Could not resolve the server replay path.');
  await fs.mkdir(path.dirname(replay.path), { recursive: true });

  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const session = {
    broadcastId,
    child: null,
    sockets: new Set(),
    writeChain: Promise.resolve(),
    queuedPcmBytes: 0,
    pcmBytes: 0,
    stopping: false,
    failed: false,
    error: '',
    currentTrackSid: '',
    handoff: false,
    handoffTimer: null,
    finishPromise: null,
    closed,
    resolveClosed,
    outputPath: replay.path,
  };

  const child = spawn(
    ffmpegPath(),
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', PCM_FORMAT,
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      '-i', 'pipe:0',
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', bitrate(),
      '-f', 'mp3',
      replay.path,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true }
  );
  session.child = child;

  let stderr = '';
  child.stderr?.on('data', (data) => {
    stderr = `${stderr}${String(data)}`.slice(-4000);
  });
  child.once('error', async (error) => {
    session.failed = true;
    session.error = error?.message || String(error);
    await persist(broadcastId, {
      'serverRecording.status': 'failed',
      'serverRecording.error': session.error.slice(0, 1000),
    });
    session.resolveClosed();
    for (const socket of session.sockets) {
      try { socket.close(1011, 'Recording encoder failed'); } catch { /* closed */ }
    }
    void finishSession(session);
  });
  child.once('close', async (code, signal) => {
    if (code !== 0 && code !== null) {
      session.failed = true;
      session.error = `FFmpeg stopped (code ${code}${signal ? `, signal ${signal}` : ''}): ${stderr.trim() || 'encoder error'}`;
      await persist(broadcastId, {
        'serverRecording.status': 'failed',
        'serverRecording.error': session.error.slice(0, 1000),
      });
      for (const socket of session.sockets) {
        try { socket.close(1011, 'Recording encoder stopped'); } catch { /* closed */ }
      }
    }
    session.resolveClosed();
    if (session.failed) void finishSession(session);
  });

  sessions.set(broadcastId, session);
  return session;
};

const getOrCreateSession = async (broadcastId) =>
  sessions.get(broadcastId) || createSession(broadcastId);

const finishSession = (session) => {
  if (!session) return null;
  if (session.finishPromise) return session.finishPromise;

  session.finishPromise = (async () => {
    session.stopping = true;
    expectedTracks.delete(session.broadcastId);
    if (session.handoffTimer) clearTimeout(session.handoffTimer);
    session.handoffTimer = null;

    if (session.failed) {
      // Failed sessions are never accepted as canonical replays, so do not
      // spend tens of seconds draining queued PCM that will be deleted.
      try { session.child?.stdin?.destroy?.(); } catch { /* already closed */ }
      if (session.child?.exitCode === null && !session.child?.killed) {
        try { session.child.kill('SIGKILL'); } catch { /* already stopped */ }
      }
    } else {
      await session.writeChain.catch(() => null);
      try {
        if (session.child?.stdin && !session.child.stdin.destroyed) {
          session.child.stdin.end();
        }
      } catch {
        // Encoder may already be closing.
      }
    }

    await Promise.race([
      session.closed,
      new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
    ]);

    if (session.child?.exitCode === null && !session.child?.killed) {
      try { session.child.kill('SIGKILL'); } catch { /* already stopped */ }
      session.failed = true;
      session.error ||= 'FFmpeg did not finish the server recording in time.';
    }

    let fileBytes = 0;
    try {
      fileBytes = (await fs.stat(session.outputPath)).size;
    } catch {
      fileBytes = 0;
    }

    const completed = !session.failed && fileBytes > 0;
    if (!completed && session.outputPath) {
      await fs.rm(session.outputPath, { force: true }).catch(() => null);
      fileBytes = 0;
    }
    await persist(session.broadcastId, {
      'serverRecording.status': completed ? 'completed' : 'failed',
      'serverRecording.endedAt': new Date(),
      'serverRecording.egressId': null,
      'serverRecording.pcmBytes': session.pcmBytes,
      'serverRecording.fileBytes': fileBytes,
      'serverRecording.error': completed
        ? null
        : String(session.error || 'Server recording produced no MP3 data.').slice(0, 1000),
    });

    sessions.delete(session.broadcastId);
    return {
      status: completed ? 'completed' : 'failed',
      pcmBytes: session.pcmBytes,
      fileBytes,
    };
  })();

  return session.finishPromise;
};

const acceptRecordingSocket = async (socket, request) => {
  const identity = validateRecordingRequest(request);
  if (!identity || !isLiveKitServerRecordingEnabled()) {
    socket.close(1008, 'Unauthorized recording stream');
    return;
  }

  const expectedTrack = expectedTracks.get(identity.broadcastId);
  if (expectedTrack && expectedTrack !== identity.trackSid) {
    socket.close(1008, 'Stale recording track');
    return;
  }

  const broadcast = await Broadcast.findOne({
    _id: identity.broadcastId,
    status: { $in: ['starting', 'live', 'ending'] },
    isDeleted: false,
  }).select('_id serverRecording');

  if (!broadcast) {
    socket.close(1008, 'Broadcast is not recordable');
    return;
  }
  if (broadcast.serverRecording?.status === 'failed') {
    socket.close(1011, 'Server recording is using browser recovery');
    return;
  }

  const session = await getOrCreateSession(identity.broadcastId);
  if (session.stopping || session.failed) {
    socket.close(1011, 'Recording session is closing');
    return;
  }

  session.sockets.add(socket);
  session.currentTrackSid = identity.trackSid;
  session.handoff = false;
  if (session.handoffTimer) clearTimeout(session.handoffTimer);
  session.handoffTimer = null;
  await persist(identity.broadcastId, {
    'serverRecording.status': 'active',
    'serverRecording.trackSid': identity.trackSid,
    'serverRecording.startedAt': broadcast.serverRecording?.startedAt || new Date(),
    'serverRecording.error': null,
  });

  socket.on('message', (data, isBinary) => {
    if (!isBinary || session.stopping || session.failed) return;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    session.queuedPcmBytes += buffer.length;
    if (session.queuedPcmBytes > MAX_PENDING_PCM_BYTES) {
      session.failed = true;
      session.error = 'Server recording encoder fell too far behind the LiveKit PCM stream.';
      void persist(identity.broadcastId, {
        'serverRecording.status': 'failed',
        'serverRecording.error': session.error,
      });
      try { socket.close(1011, 'Recording encoder backlog exceeded'); } catch { /* closed */ }
      void finishSession(session);
      return;
    }

    session.pcmBytes += buffer.length;
    session.writeChain = session.writeChain
      .then(async () => {
        try {
          await writeWithBackpressure(session.child, buffer);
        } finally {
          session.queuedPcmBytes = Math.max(0, session.queuedPcmBytes - buffer.length);
        }
      })
      .catch(async (error) => {
        session.failed = true;
        session.error = error?.message || String(error);
        await persist(identity.broadcastId, {
          'serverRecording.status': 'failed',
          'serverRecording.error': session.error.slice(0, 1000),
        });
        try { socket.close(1011, 'Recording encoder failed'); } catch { /* closed */ }
        void finishSession(session);
      });
  });

  socket.on('close', () => {
    session.sockets.delete(socket);
    if (session.stopping || session.failed) return;

    // Creator transport recovery intentionally replaces the old Track Egress
    // socket. Keep the same FFmpeg session open for the replacement track.
    if (identity.trackSid !== session.currentTrackSid || session.handoff) return;

    session.failed = true;
    session.error = 'LiveKit recording stream disconnected before End Broadcast.';
    void persist(identity.broadcastId, {
      'serverRecording.status': 'failed',
      'serverRecording.error': session.error,
    });
    void finishSession(session);
  });

  socket.on('error', (error) => {
    console.warn(
      '[Echoo Server Recording] websocket warning:',
      error?.message || error
    );
  });
};

export const attachLiveKitRecordingWebSocket = (server) => {
  if (websocketServer || !server) return websocketServer;

  // Echoo already has Socket.IO on this HTTP server. Use noServer mode and
  // claim only the dedicated recording path so this listener cannot reject or
  // consume Socket.IO/WebRTC-adjacent WebSocket upgrades.
  websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
  });
  attachedHttpServer = server;

  upgradeHandler = (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url || '/', 'http://echoo.internal').pathname;
    } catch {
      return;
    }
    if (pathname !== RECORDING_PATH) return;

    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      websocketServer.emit('connection', ws, request);
    });
  };
  server.on('upgrade', upgradeHandler);

  websocketServer.on('connection', (socket, request) => {
    void acceptRecordingSocket(socket, request).catch((error) => {
      console.warn('[Echoo Server Recording] rejected stream:', error?.message || error);
      try { socket.close(1011, 'Recording stream failed'); } catch { /* closed */ }
    });
  });

  return websocketServer;
};

export const closeLiveKitRecordingWebSocket = () => {
  if (attachedHttpServer && upgradeHandler) {
    attachedHttpServer.off('upgrade', upgradeHandler);
  }
  for (const session of sessions.values()) {
    session.stopping = true;
    for (const socket of session.sockets || []) {
      try { socket.close(1001, 'Echoo server shutting down'); } catch { /* closed */ }
    }
    try { session.child?.stdin?.end?.(); } catch { /* closing */ }
  }
  sessions.clear();
  startPromises.clear();
  expectedTracks.clear();
  desiredTracks.clear();
  try { websocketServer?.close(); } catch { /* closed */ }
  websocketServer = null;
  attachedHttpServer = null;
  upgradeHandler = null;
};

export const ensureLiveKitServerRecording = async ({
  broadcastId,
  trackSid,
} = {}) => {
  const id = safeId(broadcastId);
  const track = safeId(trackSid);
  if (!id || !track || !isLiveKitServerRecordingEnabled()) {
    return { mode: 'browser-fallback', active: false };
  }

  desiredTracks.set(id, track);

  const inFlight = startPromises.get(id);
  if (inFlight) {
    if (inFlight.trackSid === track) return inFlight.promise;

    // A creator republish can produce a new track SID while the previous
    // Egress start call is still in flight. Never drop that newer request.
    // Let the first provider call settle, then reconcile against the newest
    // track so the recorder follows the live program instead of staying bound
    // to a stale SID.
    return inFlight.promise
      .catch(() => null)
      .then(() => ensureLiveKitServerRecording({ broadcastId: id, trackSid: track }));
  }

  const task = (async () => {
    await assertFfmpegAvailable();

    if (desiredTracks.get(id) !== track) {
      return { mode: 'superseded', active: false, trackSid: track };
    }
    expectedTracks.set(id, track);

    const current = await Broadcast.findById(id).select('serverRecording');
    const recording = current?.serverRecording || null;

    // Once a server recording has broken mid-show, do not restart it and
    // silently create a replay containing only the later portion. The browser
    // OPFS master spans the whole show and becomes the authoritative recovery.
    if (recording?.status === 'failed' && recording?.startedAt) {
      expectedTracks.delete(id);
      return {
        mode: 'browser-fallback',
        active: false,
        reason: 'server-recording-interrupted',
      };
    }

    if (
      recording?.egressId &&
      recording?.trackSid === track &&
      ['starting', 'active', 'recovering'].includes(recording?.status)
    ) {
      return {
        mode: 'server-egress',
        active: true,
        egressId: recording.egressId,
        trackSid: track,
      };
    }

    if (recording?.egressId && recording?.trackSid !== track) {
      const session = sessions.get(id);
      if (session && !session.stopping && !session.failed) {
        session.currentTrackSid = track;
        session.handoff = true;
        if (session.handoffTimer) clearTimeout(session.handoffTimer);
        session.handoffTimer = setTimeout(() => {
          if (
            session.stopping ||
            session.failed ||
            !session.handoff ||
            session.currentTrackSid !== track
          ) return;
          session.failed = true;
          session.error = 'LiveKit recording track handoff did not reconnect in time.';
          void persist(id, {
            'serverRecording.status': 'failed',
            'serverRecording.error': session.error,
          });
          void finishSession(session);
        }, TRACK_HANDOFF_TIMEOUT_MS);
        session.handoffTimer.unref?.();
      }
      await LiveKitProvider.stopEgress(recording.egressId).catch(() => null);
    }

    const websocketUrl = buildSignedRecordingUrl({
      broadcastId: id,
      trackSid: track,
    });

    await persist(id, {
      'serverRecording.status': 'starting',
      'serverRecording.transport': 'livekit-track-egress',
      'serverRecording.trackSid': track,
      'serverRecording.egressId': null,
      'serverRecording.startedAt': recording?.startedAt || new Date(),
      'serverRecording.endedAt': null,
      'serverRecording.error': null,
    });

    try {
      if (desiredTracks.get(id) !== track) {
        return { mode: 'superseded', active: false, trackSid: track };
      }

      const egress = await LiveKitProvider.startTrackRecordingEgress(
        id,
        track,
        websocketUrl
      );
      const egressId = String(egress?.egressId || '');
      if (!egressId) throw new Error('LiveKit did not return an egress ID.');

      await persist(id, {
        'serverRecording.egressId': egressId,
      });

      return {
        mode: 'server-egress',
        active: true,
        egressId,
        trackSid: track,
      };
    } catch (error) {
      expectedTracks.delete(id);

      // A newer creator track may have replaced this one while the provider
      // call was in flight. That stale failure must not poison the new track's
      // recorder startup; the queued ensure call will reconcile the latest SID.
      if (desiredTracks.get(id) !== track) {
        return {
          mode: 'superseded',
          active: false,
          trackSid: track,
          reason: 'newer-track-requested',
        };
      }

      const session = sessions.get(id);
      if (session?.handoff && session.currentTrackSid === track) {
        session.failed = true;
        session.error = String(error?.message || error);
        await finishSession(session).catch(() => null);
      }
      await persist(id, {
        'serverRecording.status': 'failed',
        'serverRecording.error': String(error?.message || error).slice(0, 1000),
      });
      throw error;
    }
  })();

  const entry = { trackSid: track, promise: task };
  startPromises.set(id, entry);
  try {
    return await task;
  } finally {
    if (startPromises.get(id) === entry) startPromises.delete(id);
  }
};

export const stopLiveKitServerRecording = async (broadcastId) => {
  const id = safeId(broadcastId);
  if (!id) return null;

  expectedTracks.delete(id);
  desiredTracks.delete(id);
  const broadcast = await Broadcast.findById(id).select('serverRecording');
  const egressId = String(broadcast?.serverRecording?.egressId || '');
  const session = sessions.get(id);

  // Browser-fallback broadcasts never opened a LiveKit recording transport.
  // Leave their status alone; their bounded-chunk finalizer owns the replay.
  if (
    !session &&
    !egressId &&
    broadcast?.serverRecording?.transport !== 'livekit-track-egress'
  ) {
    return null;
  }

  // Mark intentional shutdown before asking LiveKit to stop egress. That call
  // closes the WebSocket; without this flag the close handler would mistake a
  // normal End Broadcast for an unexpected recorder failure.
  if (session) session.stopping = true;

  if (egressId) {
    await LiveKitProvider.stopEgress(egressId).catch((error) => {
      console.warn('[Echoo Server Recording] egress stop warning:', error?.message || error);
    });
  }

  if (session) return finishSession(session);

  const replay = getReplayOutputFile(id);
  let fileBytes = 0;
  try {
    fileBytes = replay?.path ? (await fs.stat(replay.path)).size : 0;
  } catch {
    fileBytes = 0;
  }

  const alreadyCompleted =
    broadcast?.serverRecording?.status === 'completed' && fileBytes > 0;
  if (!alreadyCompleted && replay?.path) {
    await fs.rm(replay.path, { force: true }).catch(() => null);
    fileBytes = 0;
  }

  await persist(id, {
    'serverRecording.status': alreadyCompleted ? 'completed' : 'failed',
    'serverRecording.endedAt': new Date(),
    'serverRecording.egressId': null,
    'serverRecording.fileBytes': fileBytes,
    'serverRecording.error': alreadyCompleted
      ? null
      : 'The server recorder was interrupted before a complete MP3 was confirmed. Browser recovery is required.',
  });
  return { status: alreadyCompleted ? 'completed' : 'failed', fileBytes, pcmBytes: 0 };
};

export default {
  attachLiveKitRecordingWebSocket,
  closeLiveKitRecordingWebSocket,
  ensureLiveKitServerRecording,
  stopLiveKitServerRecording,
  isLiveKitServerRecordingEnabled,
  getLiveKitServerRecordingDiagnostics,
};
