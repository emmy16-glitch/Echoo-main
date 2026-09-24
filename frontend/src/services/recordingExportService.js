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
// uses its native Echoo Recordings bridge. WAV is preferred while its lossless
// local master exists, otherwise the canonical server MP3 is downloaded.
export const saveAutomaticLocalCopy = async ({ blob, title, audioId } = {}) => {
  if (!isLikelyPc()) return { saved: false, skipped: 'not-pc' };

  const sourceMime = String(blob?.type || '').toLowerCase();
  const useWav = Boolean(blob?.size && sourceMime.includes('wav'));
  let bytes = useWav ? blob : null;
  const format = useWav ? 'wav' : 'mp3';
  const mimeType = useWav ? 'audio/wav' : 'audio/mpeg';

  if (!bytes && audioId) bytes = await waitForServerMp3(audioId, { attempts: 4, delayMs: 1500 });
  if (!bytes?.size) return { saved: false, skipped: 'waiting-for-server-mp3' };

  const filename = `${cleanRecordingBase(title)}.${format}`;
  if (isDesktopBridge() && typeof window.echooDesktop.saveRecording === 'function') {
    const result = await window.echooDesktop.saveRecording({
      filename,
      format,
      mimeType,
      data: new Uint8Array(await bytes.arrayBuffer()),
      automatic: true,
    });
    if (result?.cancelled) return { saved: false, cancelled: true, format };
    if (!result?.saved) throw new Error(result?.error || 'Desktop safety-copy save failed.');
    return { saved: true, filename, format, path: result.path || '' };
  }

  await downloadViaAnchor(bytes, filename);
  return { saved: true, filename, format, destination: 'browser-downloads' };
};

export const saveRecordingToPc = async ({ blob, title, format, audioId }) => {
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
  const filename = `${base}.${extension}`;

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
  isLikelyPc,
  downloadViaAnchor,
  saveAutomaticLocalCopy,
  saveRecordingToPc,
  fetchServerRecordingBlob,
  waitForServerMp3,
};
