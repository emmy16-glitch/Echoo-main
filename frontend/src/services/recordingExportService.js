import { apiFetch } from './api.js';

// Library folder name shown to the creator. Browsers cannot create
// ~/Desktop/<name> silently — the File System Access picker opens on the
// Desktop (where supported) with `Echoo Recordings/<file>` as the suggested
// name, so one click creates the library layout. The Electron desktop app
// creates ~/Desktop/Echoo Recordings directly via its native save dialog.
export const ECHOO_RECORDINGS_LIBRARY = 'Echoo Recordings';

export const RECORDING_PC_FORMATS = [
  { id: 'mp3', label: 'MP3', hint: 'Small, universal — best for sharing' },
  { id: 'wav', label: 'WAV', hint: 'Lossless master — best for editing' },
];

export const cleanRecordingBase = (title = 'Echoo live recording') =>
  String(title || 'Echoo live recording')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'Echoo-live-recording';

const isDesktopBridge = () =>
  typeof window !== 'undefined' && window.echooDesktop?.isDesktop === true;

const downloadViaAnchor = async (blob, filename) => {
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

// WAV = the local master blob captured during the broadcast (instant, offline).
// MP3 = the automatic server copy (normalised by the backend right after
// upload). Falls back to the local master when the server copy is not ready.
export const fetchServerRecordingBlob = async (audioId) => {
  const response = await apiFetch(`/audio/${encodeURIComponent(audioId)}/download`);
  if (!response.ok) throw new Error('Server MP3 is not ready yet. Try again in a few seconds.');
  return response.blob();
};

export const saveRecordingToPc = async ({ blob, title, format, audioId }) => {
  if (!blob?.size && !audioId) throw new Error('Nothing to save yet.');
  const choice = format === 'wav' ? 'wav' : 'mp3';
  const base = cleanRecordingBase(title);
  const filename = `${base}.${choice}`;
  const suggestedInLibrary = `${ECHOO_RECORDINGS_LIBRARY}/${filename}`;

  // Resolve the bytes: WAV always uses the local master; MP3 prefers the
  // automatic server copy so the PC file matches exactly what Echoo stored.
  let bytes = blob;
  let mime = choice === 'wav' ? 'audio/wav' : 'audio/mpeg';
  if (choice === 'mp3' && audioId) {
    try {
      bytes = await fetchServerRecordingBlob(audioId);
    } catch {
      // Server transcode still running — save the local master bytes under
      // the .mp3 name is wrong, so keep the WAV master and let the caller
      // surface the retry message.
      throw new Error('Server MP3 is still being prepared. Save WAV now, or retry MP3 in a few seconds.');
    }
  }
  if (!bytes?.size) throw new Error('Recording bytes are not available.');

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

  // 2) Chromium browsers: File System Access picker, opened on the Desktop
  // with the library path as the suggested name.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedInLibrary,
        startIn: 'desktop',
        types: [
          {
            description: choice === 'wav' ? 'WAV audio' : 'MP3 audio',
            accept: { [mime]: [`.${choice}`] },
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
  saveRecordingToPc,
  fetchServerRecordingBlob,
};
