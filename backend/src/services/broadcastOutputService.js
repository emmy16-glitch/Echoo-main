import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import Broadcast from '../models/Broadcast.js';

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BIT_DEPTH = 24;
const sessions = new Map();

const enabled = (name) => /^(1|true|yes)$/i.test(String(process.env[name] || '').trim());
const cleanMount = (value) => {
  const mount = String(value || '').trim();
  return /^\/[a-zA-Z0-9._/-]+$/.test(mount) ? mount : '';
};
const safeFileId = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
const archiveDirectory = () => path.resolve(
  process.env.MASTER_ARCHIVE_DIR || path.join(process.cwd(), 'data', 'broadcast-masters')
);

const radioConfig = () => {
  if (!enabled('RADIO_STREAM_ENABLED')) return null;
  const host = String(process.env.RADIO_STREAM_HOST || '').trim();
  const port = Number(process.env.RADIO_STREAM_PORT || 8000);
  const mount = cleanMount(process.env.RADIO_STREAM_MOUNT);
  const username = String(process.env.RADIO_STREAM_USERNAME || '').trim();
  const password = String(process.env.RADIO_STREAM_PASSWORD || '').trim();
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !mount || !username || !password) return null;
  const base = String(process.env.RADIO_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  return {
    url: `icecast://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}${mount}`,
    publicUrl: base ? `${base}${mount}` : null,
  };
};

const archiveEnabled = () => enabled('MASTER_ARCHIVE_ENABLED');

const state = (status, extra = {}) => ({ ...extra, status });

const persist = async (broadcastId, patch) => {
  await Broadcast.updateOne({ _id: broadcastId }, { $set: patch }).catch((error) => {
    console.warn('[Echoo Outputs] metadata update failed:', error?.message || error);
  });
};

const spawnEncoder = ({ args, label, onFailure }) => {
  const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr = `${stderr}${data}`.slice(-4000); });
  child.once('error', (error) => onFailure(error));
  child.once('exit', (code, signal) => {
    if (code !== 0 && code !== null) onFailure(new Error(`${label} stopped (code ${code}${signal ? `, ${signal}` : ''}): ${stderr.trim() || 'encoder error'}`));
  });
  return child;
};

const writeEncoder = async (child, pcm) => {
  if (!child?.stdin || child.stdin.destroyed || !pcm?.length) return;
  if (!child.stdin.write(pcm)) {
    await new Promise((resolve, reject) => {
      child.stdin.once('drain', resolve);
      child.stdin.once('error', reject);
    });
  }
};

const finishEncoder = async (child) => {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 15_000);
    child.once('close', () => { clearTimeout(timeout); resolve(); });
    child.stdin.end();
  });
};

// Strictly parses the browser-generated PCM WAV chunks. This deliberately does
// not accept compressed or client-directed files as an encoder input.
export const pcmFromWavChunk = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Expected a RIFF/WAVE PCM chunk');
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new Error('WAV chunk is truncated');
    if (id === 'fmt ' && size >= 16) {
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitDepth: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.encoding !== 1 || format.sampleRate !== SAMPLE_RATE || format.channels !== CHANNELS || format.bitDepth !== BIT_DEPTH || data.length % (CHANNELS * (BIT_DEPTH / 8))) {
    throw new Error('Expected 48 kHz stereo 24-bit PCM WAV');
  }
  return data;
};

export async function startBroadcastOutputs(broadcastId) {
  const id = safeFileId(broadcastId);
  if (!id || sessions.has(id)) return sessions.get(id)?.snapshot || { radioOutput: state('idle'), masterRecording: state('idle') };

  const radio = radioConfig();
  const useArchive = archiveEnabled();
  const snapshot = {
    radioOutput: radio
      ? state('starting', { codec: 'mp3', sampleRate: SAMPLE_RATE, channels: CHANNELS, bitrate: 320000, publicUrl: radio.publicUrl })
      : state('idle', { reason: enabled('RADIO_STREAM_ENABLED') ? 'Radio configuration is incomplete.' : 'Radio output is disabled.' }),
    masterRecording: useArchive
      ? state('starting', { codec: 'flac', sampleRate: SAMPLE_RATE, channels: CHANNELS, bitDepth: BIT_DEPTH, sourceStage: 'pre_opus_pcm' })
      : state('idle', { reason: 'Master archive is disabled.' }),
  };
  const session = { id, radio: null, archive: null, snapshot, failures: new Set() };
  sessions.set(id, session);
  await persist(id, snapshot);

  if (radio) {
    try {
      session.radio = spawnEncoder({
        label: 'MP3 radio encoder',
        args: ['-hide_banner', '-loglevel', 'error', '-f', 's24le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), '-i', 'pipe:0', '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', '-minrate', '320k', '-maxrate', '320k', '-bufsize', '640k', '-f', 'mp3', radio.url],
        onFailure: async (error) => {
          if (session.failures.has('radio')) return;
          session.failures.add('radio');
          session.snapshot.radioOutput = state('failed', { ...session.snapshot.radioOutput, error: String(error?.message || error).slice(0, 1000) });
          await persist(id, { radioOutput: session.snapshot.radioOutput });
          console.warn('[Echoo Outputs] radio encoder failed; LiveKit continues:', error?.message || error);
        },
      });
      session.snapshot.radioOutput = state('active', { ...session.snapshot.radioOutput });
    } catch (error) {
      session.snapshot.radioOutput = state('failed', { ...session.snapshot.radioOutput, error: String(error?.message || error) });
    }
  }

  if (useArchive) {
    try {
      const directory = archiveDirectory();
      await fs.mkdir(directory, { recursive: true });
      const storageKey = `${id}.flac`;
      const outputPath = path.join(directory, storageKey);
      session.archive = spawnEncoder({
        label: 'FLAC archive encoder',
        args: ['-hide_banner', '-loglevel', 'error', '-f', 's24le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), '-i', 'pipe:0', '-vn', '-c:a', 'flac', '-compression_level', '5', '-sample_fmt', 's32', '-bits_per_raw_sample', '24', outputPath],
        onFailure: async (error) => {
          if (session.failures.has('archive')) return;
          session.failures.add('archive');
          session.snapshot.masterRecording = state('failed', { ...session.snapshot.masterRecording, storageKey, error: String(error?.message || error).slice(0, 1000) });
          await persist(id, { masterRecording: session.snapshot.masterRecording });
          console.warn('[Echoo Outputs] FLAC archive failed; LiveKit continues:', error?.message || error);
        },
      });
      session.snapshot.masterRecording = state('active', { ...session.snapshot.masterRecording, storageKey });
    } catch (error) {
      session.snapshot.masterRecording = state('failed', { ...session.snapshot.masterRecording, error: String(error?.message || error) });
    }
  }

  await persist(id, session.snapshot);
  return session.snapshot;
}

export async function appendBroadcastOutputPcm(broadcastId, wavBuffer) {
  const session = sessions.get(safeFileId(broadcastId));
  if (!session) return;
  const pcm = pcmFromWavChunk(wavBuffer);
  await Promise.allSettled([writeEncoder(session.radio, pcm), writeEncoder(session.archive, pcm)]);
}

export async function stopBroadcastOutputs(broadcastId, { incomplete = false } = {}) {
  const id = safeFileId(broadcastId);
  const session = sessions.get(id);
  if (!session) return null;
  sessions.delete(id);
  await Promise.allSettled([finishEncoder(session.radio), finishEncoder(session.archive)]);
  if (session.snapshot.radioOutput.status === 'active') {
    session.snapshot.radioOutput = state(
      incomplete ? 'failed' : 'completed',
      incomplete ? { ...session.snapshot.radioOutput, error: 'PCM transport ended before all output audio was delivered.' } : session.snapshot.radioOutput
    );
  }
  if (session.snapshot.masterRecording.status === 'active') {
    session.snapshot.masterRecording = state(
      incomplete ? 'failed' : 'completed',
      incomplete ? { ...session.snapshot.masterRecording, error: 'PCM transport ended before all archive audio was delivered.' } : session.snapshot.masterRecording
    );
  }
  await persist(id, session.snapshot);
  return session.snapshot;
}

export const getBroadcastOutputState = (broadcastId) => sessions.get(safeFileId(broadcastId))?.snapshot || null;
