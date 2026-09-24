import { apiFetch } from './api.js';

// Library folder name used by the desktop app. Browsers cannot silently
// create ~/Desktop/<name>; their save picker opens at the Desktop and suggests
// the filename only. The Electron app can create/use Echoo Recordings itself.
export const ECHOO_RECORDINGS_LIBRARY = 'Echoo Recordings';

export const RECORDING_PC_FORMATS = [
  { id: 'mp3', label: 'MP3', hint: 'Recommended · small and widely supported' },
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

// WAV = a matching local WAV master captured during the broadcast.
// MP3 = the automatic server copy (normalised by the backend after upload).
// Opus is offered only when the local master is already an Opus-compatible
// OGG/WebM container; Echoo never renames WAV bytes to an Opus extension.
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

// Poll the server until the automatic MP3 transcode finishes.
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

// End Broadcast has no active save-button gesture, so a browser cannot write
// to an arbitrary folder silently. On PCs we create a normal browser download
// (therefore using the browser's configured Downloads path); the desktop app
// uses its native Echoo Recordings bridge.
//
// The normal automatic copy is ALWAYS the canonical server MP3 (fetched by
// audioId). A local WAV blob is never auto-downloaded just because the
// temporary recovery master happens to be WAV — that 500MB+ surprise is
// exactly what the server-finalization architecture removed.
export const saveAutomaticLocalCopy = async ({
  blob,
  title,
  audioId,
  format = 'mp3',
  channelName = '',
  startedAt = null,
} = {}) => {
  if (format === 'none') return { saved: false, skipped: 'device-copy-disabled' };

  const choice = format === 'wav' ? 'wav' : 'mp3';
  let bytes = null;
  let mimeType = 'audio/mpeg';

  if (choice === 'wav') {
    const sourceMime = String(blob?.type || '').toLowerCase();
    if (!blob?.size || !sourceMime.includes('wav')) {
      return { saved: false, skipped: 'wav-master-unavailable', format: 'wav' };
    }
    bytes = blob;
    mimeType = 'audio/wav';
  } else {
    if (!audioId) return { saved: false, skipped: 'server-mp3-unavailable', format: 'mp3' };
    bytes = await waitForServerMp3(audioId, { attempts: 4, delayMs: 1500 });
    if (!bytes?.size) return { saved: false, skipped: 'waiting-for-server-mp3', format: 'mp3' };
  }

  const filename = buildRecordingFilename({
    title,
    channelName,
    startedAt,
    format: choice,
  });

  if (isDesktopBridge() && typeof window.echooDesktop.saveRecording === 'function') {
    const result = await window.echooDesktop.saveRecording({
      filename,
      format: choice,
      mimeType,
      data: new Uint8Array(await bytes.arrayBuffer()),
      automatic: true,
    });
    if (result?.cancelled) return { saved: false, cancelled: true, format: choice };
    if (!result?.saved) throw new Error(result?.error || 'Desktop recording save failed.');
    return {
      saved: true,
      filename,
      format: choice,
      path: result.path || '',
      destination: ECHOO_RECORDINGS_LIBRARY,
    };
  }

  // Browsers cannot create an arbitrary "Echoo Recordings" folder silently.
  // Use the browser's download storage on both computers and phones. The
  // human-readable Echoo filename keeps every take recognizable without
  // renaming; native Echoo apps use the real Echoo Recordings folder above.
  await downloadViaAnchor(bytes, filename);
  return {
    saved: true,
    filename,
    format: choice,
    destination: 'browser-downloads',
    deviceKind: isLikelyPc() ? 'computer' : 'mobile',
  };
};

export const saveRecordingToPc = async ({ blob, title, format, audioId, channelName = '', startedAt = null }) => {
  if (!blob?.size && !audioId) throw new Error('Nothing to save yet.');
  const choice = format === 'wav' ? 'wav' : format === 'opus' ? 'opus' : 'mp3';
  const base = cleanRecordingBase(title);

  // Resolve the bytes and keep the filename/container truthful. WAV and Opus
  // are only valid when this device still has a matching local master. MP3
  // comes from Echoo's canonical server copy.
  let bytes = blob;
  const sourceMime = String(blob?.type || '').toLowerCase();
  let extension;
  let mime;

  if (choice === 'mp3') {
    if (!audioId) throw new Error('The stored MP3 copy is not available yet.');
    try {
      bytes = await fetchServerRecordingBlob(audioId);
      mime = 'audio/mpeg';
      extension = 'mp3';
    } catch {
      throw new Error('Server MP3 is still being prepared. Retry in a few seconds.');
    }
  } else if (choice === 'wav') {
    if (!bytes?.size || !sourceMime.includes('wav')) {
      throw new Error('The WAV master is no longer available on this device.');
    }
    mime = 'audio/wav';
    extension = 'wav';
  } else {
    if (!bytes?.size || !(sourceMime.includes('opus') || sourceMime.includes('ogg') || sourceMime.includes('webm'))) {
      throw new Error('The compressed Opus master is no longer available on this device.');
    }
    if (sourceMime.includes('webm')) {
      extension = 'webm';
      mime = 'audio/webm';
    } else if (sourceMime.includes('ogg')) {
      extension = 'ogg';
      mime = 'audio/ogg';
    } else {
      extension = 'opus';
      mime = 'audio/ogg';
    }
  }

  if (!bytes?.size) throw new Error('Recording bytes are not available.');
  const filename = buildRecordingFilename({
    title: title || base,
    channelName,
    startedAt,
    format: extension === 'wav' ? 'wav' : extension === 'opus' || extension === 'ogg' || extension === 'webm' ? 'opus' : 'mp3',
  }).replace(/\.opus$/i, `.${extension}`);

  // 1) Electron desktop: native dialog defaulting to ~/Desktop/Echoo Recordings.
  if (isDesktopBridge() && typeof window.echooDesktop.saveRecording === 'function') {
    const result = await window.echooDesktop.saveRecording({
      filename,
      format: choice,
      mimeType: mime,
      // ArrayBuffer crosses IPC cleanly; Blob does not.
      data: new Uint8Array(await bytes.arrayBuffer()),
    });
    if (result?.cancelled) return { saved: false, cancelled: true };
    if (!result?.saved) throw new Error(result?.error || 'Desktop save failed.');
    return { saved: true, path: result.path || '', filename };
  }

  // 2) Chromium browsers: File System Access picker, opened on the Desktop.
  // suggestedName must be a filename, not a nested path.
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
      return { saved: true, filename };
    } catch (error) {
      if (error?.name === 'AbortError') return { saved: false, cancelled: true };
      // Fall through to anchor download.
    }
  }

  // 3) Fallback: normal download (user moves it into Desktop/Echoo Recordings).
  await downloadViaAnchor(bytes, filename);
  return { saved: true, filename };
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
