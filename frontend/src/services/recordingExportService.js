import { apiFetch } from './api.js';
import {
  DEFAULT_LOCAL_MP3_BITRATE_KBPS,
  encodeLocalWavToMp3,
} from './localRecordingTranscode.js';

// Library folder name used by the desktop app. Browsers cannot silently
// create ~/Desktop/<name>; their save picker opens at the Desktop and suggests
// the filename only. The Electron app can create/use Echoo Recordings itself.
export const ECHOO_RECORDINGS_LIBRARY = 'Echoo Recordings';

export const RECORDING_PC_FORMATS = [
  { id: 'mp3', label: 'MP3', hint: 'Recommended · local 320 kbps copy' },
  { id: 'opus', label: 'Opus', hint: 'Compressed local master when available' },
  { id: 'wav', label: 'WAV', hint: 'Lossless local master for editing' },
];

export const cleanRecordingBase = (title = 'Echoo live recording') =>
  String(title || 'Echoo live recording')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'Echoo-live-recording';

const cleanHumanSegment = (value = '') =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .slice(0, 64)
    .trim();

export const formatRecordingDateStamp = (value = Date.now()) => {
  const date = new Date(value || Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (part) => String(part).padStart(2, '0');
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())} ${pad(safe.getHours())}-${pad(safe.getMinutes())}`;
};

export const buildRecordingFilename = ({
  title = 'Live broadcast',
  channelName = '',
  startedAt = null,
  format = 'mp3',
} = {}) => {
  const extension = format === 'wav' ? 'wav' : format === 'opus' ? 'opus' : 'mp3';
  const channel = cleanHumanSegment(channelName);
  const recordingTitle = cleanHumanSegment(title) || 'Live broadcast';
  const parts = ['Echoo'];
  if (channel && channel.toLowerCase() !== recordingTitle.toLowerCase()) parts.push(channel);
  parts.push(recordingTitle, formatRecordingDateStamp(startedAt || Date.now()));
  return `${parts.join(' - ')}.${extension}`;
};

const isDesktopBridge = () =>
  typeof window !== 'undefined' && window.echooDesktop?.isDesktop === true;

const sourceMime = (blob) => String(blob?.type || '').toLowerCase();
const isWavMaster = (blob) => Boolean(blob?.size && sourceMime(blob).includes('wav'));

export const downloadViaAnchor = async (blob, filename) => {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
};

export const isLikelyPc = () => {
  if (isDesktopBridge()) return true;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const mobileUa = /android|iphone|ipad|ipod|mobile/i.test(String(navigator.userAgent || ''));
  if (mobileUa) return false;
  return window.innerWidth >= 768 || Boolean(window.matchMedia?.('(pointer: fine)')?.matches);
};

const tryMobileShare = async ({ blob, filename, mimeType }) => {
  if (
    isLikelyPc() ||
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof File === 'undefined'
  ) return null;

  const file = new File([blob], filename, { type: mimeType });
  const payload = { files: [file], title: 'Save Echoo recording' };
  if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) return null;

  try {
    await navigator.share(payload);
    return {
      saved: true,
      filename,
      destination: 'mobile-share-sheet',
      deviceKind: 'mobile',
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { saved: false, cancelled: true, filename, deviceKind: 'mobile' };
    }
    return null;
  }
};

// Server downloads remain useful for recordings whose local master has already
// been cleared, but a just-finished live recording no longer depends on this
// endpoint for its MP3 device copy.
export const fetchServerRecordingBlob = async (audioId) => {
  const response = await apiFetch(`/audio/${encodeURIComponent(audioId)}/download`);
  if (!response.ok) throw new Error('Server MP3 is not ready yet. Try again in a few seconds.');
  const blob = await response.blob();
  const mimeType = String(blob.type || response.headers.get('content-type') || '').toLowerCase();
  if (!(mimeType.includes('mpeg') || mimeType.includes('mp3'))) {
    throw new Error('Server MP3 is still being prepared. Try again in a few seconds.');
  }
  return blob;
};

export const waitForServerMp3 = async (audioId, { attempts = 10, delayMs = 3000 } = {}) => {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetchServerRecordingBlob(audioId);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error('Server MP3 is not ready yet.');
};

const createLocalMp3 = async (blob, { onProgress = null, onChunk = null } = {}) => {
  if (!isWavMaster(blob)) {
    throw new Error('A local WAV safety master is required for server-independent MP3 saving.');
  }
  return encodeLocalWavToMp3({
    blob,
    bitrateKbps: DEFAULT_LOCAL_MP3_BITRATE_KBPS,
    onProgress,
    onChunk,
  });
};

const scheduleEncodedCleanup = (encoded, delayMs = 60_000) => {
  if (typeof encoded?.dispose !== 'function') return;
  window.setTimeout(() => {
    try {
      void Promise.resolve(encoded.dispose()).catch(() => {});
    } catch {
      // Best-effort cleanup; the source OPFS WAV remains the durable master.
    }
  }, delayMs);
};


const saveDesktopBytes = async ({
  bytes,
  filename,
  format,
  mimeType,
  automatic = false,
  startedAt = null,
}) => {
  if (!isDesktopBridge() || typeof window.echooDesktop.saveRecording !== 'function') return null;
  const result = await window.echooDesktop.saveRecording({
    filename,
    format,
    mimeType,
    data: new Uint8Array(await bytes.arrayBuffer()),
    automatic,
    startedAt: startedAt || null,
  });
  if (result?.cancelled) return { saved: false, cancelled: true, format };
  if (!result?.saved) throw new Error(result?.error || 'Desktop recording save failed.');
  return {
    saved: true,
    filename,
    format,
    path: result.path || '',
    destination: ECHOO_RECORDINGS_LIBRARY,
  };
};

// Automatic device saving is independent of server replay readiness.
// MP3 is encoded locally from the OPFS WAV after the live stream is already
// off-air. WAV is copied directly. The server MP3 continues in parallel.
export const saveAutomaticLocalCopy = async ({
  blob,
  title,
  audioId,
  format = 'mp3',
  channelName = '',
  startedAt = null,
  onProgress = null,
} = {}) => {
  if (format === 'none') return { saved: false, skipped: 'device-copy-disabled' };

  const choice = format === 'wav' ? 'wav' : 'mp3';

  // Only Echoo Desktop can prove a background save completed. Browsers may
  // block async downloads/share sheets once the End Broadcast click gesture
  // has expired, so keep the OPFS master and ask for one explicit tap instead
  // of falsely reporting success.
  if (!isDesktopBridge()) {
    return {
      saved: false,
      skipped: 'browser-user-gesture-required',
      requiresUserGesture: true,
      format: choice,
    };
  }

  let bytes = null;
  let encodedLocal = null;
  let mimeType = choice === 'wav' ? 'audio/wav' : 'audio/mpeg';
  let source = 'local-master';

  if (choice === 'wav') {
    if (!isWavMaster(blob)) {
      return { saved: false, skipped: 'wav-master-unavailable', format: 'wav' };
    }
    bytes = blob;
  } else if (isWavMaster(blob)) {
    encodedLocal = await createLocalMp3(blob, { onProgress });
    bytes = encodedLocal.blob;
    source = 'local-wav-encode';
  } else if (audioId) {
    // Legacy/non-WAV fallback: use a durable server MP3 when no PCM master
    // exists. This does not affect the normal OPFS-backed live path.
    bytes = await waitForServerMp3(audioId, { attempts: 2, delayMs: 1000 });
    source = 'server-mp3-fallback';
  } else {
    return { saved: false, skipped: 'local-mp3-source-unavailable', format: 'mp3' };
  }

  if (!bytes?.size) return { saved: false, skipped: 'device-bytes-unavailable', format: choice };

  const filename = buildRecordingFilename({
    title,
    channelName,
    startedAt,
    format: choice,
  });

  const desktopResult = await saveDesktopBytes({
    bytes,
    filename,
    format: choice,
    mimeType,
    automatic: true,
    startedAt,
  });
  if (desktopResult) {
    scheduleEncodedCleanup(encodedLocal, 0);
    return { ...desktopResult, source };
  }

  // Defensive fallback: desktop bridge disappeared after capability check.
  // Do not claim the file was saved; keep the local master for an explicit
  // user-triggered export.
  scheduleEncodedCleanup(encodedLocal, 0);
  return {
    saved: false,
    skipped: 'browser-user-gesture-required',
    requiresUserGesture: true,
    filename,
    format: choice,
    source,
  };
};

const saveLocalMp3WithPicker = async ({
  blob,
  filename,
  onProgress = null,
}) => {
  if (!isWavMaster(blob) || typeof window.showSaveFilePicker !== 'function') return null;

  let handle;
  try {
    // Open the picker before encoder initialization so this stays within the
    // user's save-button gesture.
    handle = await window.showSaveFilePicker({
      suggestedName: filename,
      startIn: 'desktop',
      types: [
        {
          description: 'MP3 audio',
          accept: { 'audio/mpeg': ['.mp3'] },
        },
      ],
    });
  } catch (error) {
    if (error?.name === 'AbortError') return { saved: false, cancelled: true, filename };
    return null;
  }

  const writable = await handle.createWritable();
  try {
    const encoded = await createLocalMp3(blob, {
      onProgress,
      onChunk: (chunk) => writable.write(chunk),
    });
    await writable.close();
    return {
      saved: true,
      filename,
      format: 'mp3',
      source: 'local-wav-encode',
      encodedBytes: encoded.encodedBytes,
      destination: 'file-picker',
    };
  } catch (error) {
    try { await writable.abort?.(); } catch { /* best effort */ }
    throw error;
  }
};

export const saveRecordingToPc = async ({
  blob,
  title,
  format,
  audioId,
  channelName = '',
  startedAt = null,
  onProgress = null,
}) => {
  if (!blob?.size && !audioId) throw new Error('Nothing to save yet.');
  const choice = format === 'wav' ? 'wav' : format === 'opus' ? 'opus' : 'mp3';
  const base = cleanRecordingBase(title);
  const localMime = sourceMime(blob);

  let extension =
    choice === 'wav'
      ? 'wav'
      : choice === 'opus'
        ? localMime.includes('webm')
          ? 'webm'
          : localMime.includes('ogg')
            ? 'ogg'
            : 'opus'
        : 'mp3';
  let mime =
    choice === 'wav'
      ? 'audio/wav'
      : choice === 'opus'
        ? localMime.includes('webm')
          ? 'audio/webm'
          : 'audio/ogg'
        : 'audio/mpeg';

  const filename = buildRecordingFilename({
    title: title || base,
    channelName,
    startedAt,
    format: extension === 'wav'
      ? 'wav'
      : extension === 'opus' || extension === 'ogg' || extension === 'webm'
        ? 'opus'
        : 'mp3',
  }).replace(/\.opus$/i, `.${extension}`);

  // User-requested MP3 can be written incrementally on supporting desktop
  // browsers, so a long WAV never needs to become one giant in-memory MP3.
  if (choice === 'mp3' && !isDesktopBridge()) {
    const streamed = await saveLocalMp3WithPicker({
      blob,
      filename,
      onProgress,
    });
    if (streamed) return streamed;
  }

  let bytes = blob;
  let encodedLocal = null;
  let source = 'local-master';

  if (choice === 'mp3') {
    if (isWavMaster(blob)) {
      encodedLocal = await createLocalMp3(blob, { onProgress });
      bytes = encodedLocal.blob;
      source = 'local-wav-encode';
    } else if (audioId) {
      bytes = await fetchServerRecordingBlob(audioId);
      source = 'server-mp3-fallback';
    } else {
      throw new Error('A local WAV master is required to create an MP3 while the server is unavailable.');
    }
  } else if (choice === 'wav') {
    if (!isWavMaster(bytes)) {
      throw new Error('The WAV master is no longer available on this device.');
    }
  } else {
    if (!bytes?.size || !(localMime.includes('opus') || localMime.includes('ogg') || localMime.includes('webm'))) {
      throw new Error('The compressed Opus master is no longer available on this device.');
    }
  }

  if (!bytes?.size) throw new Error('Recording bytes are not available.');

  const desktopResult = await saveDesktopBytes({
    bytes,
    filename,
    format: choice,
    mimeType: mime,
    automatic: false,
    startedAt,
  });
  if (desktopResult) {
    scheduleEncodedCleanup(encodedLocal, 0);
    return { ...desktopResult, source };
  }

  const mobileResult = await tryMobileShare({
    blob: bytes,
    filename,
    mimeType: mime,
  });
  if (mobileResult) {
    scheduleEncodedCleanup(encodedLocal, 0);
    return { ...mobileResult, format: choice, source };
  }

  // Chromium desktop for WAV/Opus/server-MP3. Local WAV→MP3 already used the
  // streaming picker above, so this branch does not buffer that conversion.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        startIn: 'desktop',
        types: [
          {
            description: choice === 'wav' ? 'WAV audio' : choice === 'opus' ? 'Opus audio' : 'MP3 audio',
            accept: { [mime]: [`.${extension}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      scheduleEncodedCleanup(encodedLocal, 0);
      return { saved: true, filename, format: choice, source, destination: 'file-picker' };
    } catch (error) {
      if (error?.name === 'AbortError') return { saved: false, cancelled: true, filename };
      // Fall through to a normal download.
    }
  }

  await downloadViaAnchor(bytes, filename);
  scheduleEncodedCleanup(encodedLocal);
  return {
    saved: true,
    filename,
    format: choice,
    source,
    destination: 'browser-downloads',
    deviceKind: isLikelyPc() ? 'computer' : 'mobile',
  };
};

export default {
  ECHOO_RECORDINGS_LIBRARY,
  RECORDING_PC_FORMATS,
  cleanRecordingBase,
  buildRecordingFilename,
  formatRecordingDateStamp,
  isLikelyPc,
  downloadViaAnchor,
  saveAutomaticLocalCopy,
  saveRecordingToPc,
  fetchServerRecordingBlob,
  waitForServerMp3,
};
