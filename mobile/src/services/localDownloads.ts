import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  API_URL,
  EchooAudio,
  EchooDownload,
  getAccessToken,
  hasEchooSession,
  requestDownload,
  updateDownloadProgress,
} from '@/src/services/echooApi';

type FileSystemModule = {
  documentDirectory?: string | null;
  makeDirectoryAsync: (fileUri: string, options?: { intermediates?: boolean }) => Promise<void>;
  readAsStringAsync: (fileUri: string) => Promise<string>;
  writeAsStringAsync: (fileUri: string, contents: string) => Promise<void>;
  downloadAsync: (
    uri: string,
    fileUri: string,
    options?: { headers?: Record<string, string> }
  ) => Promise<{ uri: string; status: number; headers?: Record<string, string> }>;
  createDownloadResumable?: (
    uri: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
    callback?: (data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void
  ) => {
    downloadAsync: () => Promise<{ uri: string; status: number; headers?: Record<string, string> } | undefined>;
  };
  deleteAsync: (fileUri: string, options?: { idempotent?: boolean }) => Promise<void>;
  getInfoAsync?: (fileUri: string) => Promise<{ exists: boolean; size?: number }>;
};

export type LocalDownload = EchooDownload & {
  localUri?: string;
  track: EchooAudio | null;
};

const statusListeners = new Set<() => void>();
const statusSnapshot = new Map<string, { status: LocalDownload['status']; progress: number }>();
let statusAccount: string | null = null;
function applyStatusAccount(account: string | null) {
  if (statusAccount !== account) {
    statusAccount = account;
    statusSnapshot.clear();
    emitStatusChange();
  }
  return account;
}
let indexMutationQueue: Promise<void> = Promise.resolve();
const activeDownloads = new Map<string, Promise<LocalDownload>>();
const activeDownloadTracks = new Map<string, EchooAudio>();

export async function getActiveLocalDownloads(): Promise<LocalDownload[]> {
  const accountId = await getOptionalAccountScope();
  if (!accountId) return [];
  const rows: LocalDownload[] = [];
  for (const [key, track] of activeDownloadTracks) {
    if (!key.startsWith(`${accountId}:`)) continue;
    rows.push({ id: track.id, trackId: track.id, track, status: 'downloading',
      progress: statusSnapshot.get(track.id)?.progress || 1, quality: 'medium', fileSize: 0, downloadedSize: 0 });
  }
  return rows;
}

function emitStatusChange() {
  statusListeners.forEach((listener) => listener());
}

function setTrackStatus(trackId: string, status: LocalDownload['status'], progress: number, accountId: string) {
  if (statusAccount !== accountId) return;
  if (!trackId) return;
  statusSnapshot.set(trackId, { status, progress });
  emitStatusChange();
}

export function subscribeLocalDownloadStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getLocalDownloadStatusSnapshot(trackId: string) {
  return statusSnapshot.get(trackId) || { status: 'pending' as const, progress: 0 };
}

async function loadFileSystem(): Promise<FileSystemModule> {
  return import('expo-file-system/legacy') as Promise<FileSystemModule>;
}

async function getOptionalAccountScope() {
  if (!await hasEchooSession()) return applyStatusAccount(null);
  if (Platform.OS !== 'web') {
    const persisted = await SecureStore.getItemAsync('echoo.accountScope');
    if (persisted) return applyStatusAccount(persisted);
  }
  const token = await getAccessToken();
  const encodedPayload = token?.split('.')[1];
  if (!encodedPayload) return applyStatusAccount(null);
  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded));
    const accountId = payload.userId || payload.sub || payload.id || payload._id;
    if (accountId) {
      if (Platform.OS !== 'web') await SecureStore.setItemAsync('echoo.accountScope', String(accountId));
      return applyStatusAccount(String(accountId));
    }
  } catch { /* fail closed below; unscoped files could leak between accounts */ }
  return applyStatusAccount(null);
}

async function getAccountScope() {
  const accountId = await getOptionalAccountScope();
  if (accountId) return accountId;
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to manage offline downloads.');
  throw new Error('Could not identify the signed-in account for offline storage.');
}

// Downloaded audio and its index belong to the same account-scoped app-private folder.
// Store the index as a file, not in SecureStore (which has strict key and value limits).
async function downloadIndexLocation(accountId = '') {
  accountId ||= await getAccountScope();
  const FileSystem = await loadFileSystem();
  if (!FileSystem.documentDirectory) throw new Error('Offline storage is unavailable.');
  const directory = `${FileSystem.documentDirectory}echoo-downloads/${encodeURIComponent(accountId)}/`;
  return { FileSystem, directory, path: `${directory}downloads.json` };
}

async function readStoredDownloads(accountId = ''): Promise<Record<string, LocalDownload>> {
  if (Platform.OS === 'web') return {};
  accountId ||= await getOptionalAccountScope() || '';
  if (!accountId) return {};
  const { FileSystem, path } = await downloadIndexLocation(accountId);
  const slots = await readIndexSlots(FileSystem, path);
  if (slots.length) return slots[0].downloads;
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Offline downloads index is invalid.');
    }
    return parsed as Record<string, LocalDownload>;
  } catch {
    // Missing index is normal on first launch. Preserve an existing but corrupt
    // index rather than silently overwriting it and losing download references.
    const info = await FileSystem.getInfoAsync?.(path).catch(() => null);
    const slotInfo = await Promise.all(['a', 'b'].map((slot) => FileSystem.getInfoAsync?.(`${path}.${slot}`).catch(() => null)));
    if (!info?.exists && !slotInfo.some((slot) => slot?.exists)) return {};
    throw new Error('Could not read saved offline downloads.');
  }
}

async function readIndexSlots(FileSystem: FileSystemModule, path: string) {
  const slots: { slot: string; revision: number; downloads: Record<string, LocalDownload> }[] = [];
  for (const slot of ['a', 'b']) {
    try {
      const value = JSON.parse(await FileSystem.readAsStringAsync(`${path}.${slot}`));
      if (value.version === 1 && Number.isSafeInteger(value.revision) && value.revision > 0 && value.downloads &&
        typeof value.downloads === 'object' && !Array.isArray(value.downloads)) {
        slots.push({ slot, revision: value.revision, downloads: value.downloads });
      }
    } catch { /* The other slot retains the last complete write. */ }
  }
  return slots.sort((a, b) => b.revision - a.revision);
}

async function writeStoredDownloads(downloads: Record<string, LocalDownload>, accountId: string) {
  if (Platform.OS === 'web') return;
  const { FileSystem, directory, path } = await downloadIndexLocation(accountId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const previous = (await readIndexSlots(FileSystem, path))[0];
  const slot = previous?.slot === 'a' ? 'b' : 'a';
  const record = { version: 1, revision: (previous?.revision || 0) + 1, downloads };
  const serialized = JSON.stringify(record);
  // Write the inactive slot; an interrupted write cannot destroy the current
  // index. Reads pick the newest complete slot, with legacy-index migration.
  await FileSystem.writeAsStringAsync(`${path}.${slot}`, serialized);
  if (await FileSystem.readAsStringAsync(`${path}.${slot}`) !== serialized) {
    throw new Error('Could not verify the saved downloads index. Please try again.');
  }
}

// Serialize index changes so two finished downloads cannot overwrite each other.
async function mutateStoredDownloads(change: (downloads: Record<string, LocalDownload>) => void, accountId: string) {
  const update = async () => {
    if (await getAccountScope() !== accountId) throw new Error('Your account changed. Please try again.');
    const stored = await readStoredDownloads(accountId);
    change(stored);
    await writeStoredDownloads(stored, accountId);
  };
  const pending = indexMutationQueue.then(update, update);
  indexMutationQueue = pending.catch(() => undefined);
  await pending;
}

function getExtension(track: EchooAudio) {
  const source = track.fileUrl || '';
  const clean = source.split('?')[0] || '';
  const match = clean.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : 'mp3';
}

export async function getLocalDownloads(): Promise<LocalDownload[]> {
  const stored = await readStoredDownloads();
  const FileSystem = Platform.OS === 'web' ? null : await loadFileSystem();
  const rows: LocalDownload[] = [];
  for (const download of Object.values(stored)) {
    const info: { exists: boolean; size?: number } = download.localUri && FileSystem?.getInfoAsync
      ? await FileSystem.getInfoAsync(download.localUri).catch(() => ({ exists: false }))
      : { exists: false };
    if (download.status === 'completed' && download.localUri && info.exists && (info.size == null || Number(info.size) > 0)) {
      rows.push(download);
    }
  }
  // Refreshing the library must not erase transfers that are still running.
  for (const [id, status] of statusSnapshot) {
    if (status.status !== 'downloading') statusSnapshot.delete(id);
  }
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  rows.forEach((download) => {
    if (download.trackId) {
      statusSnapshot.set(download.trackId, {
        status: download.status,
        progress: Number(download.progress) || 0,
      });
    }
  });
  emitStatusChange();
  return rows;
}

export async function isAudioDownloaded(trackId: string) {
  if (!trackId) return false;
  const stored = await readStoredDownloads();
  const download = stored[trackId];
  if (download?.status !== 'completed' || !download.localUri) return false;
  const FileSystem = await loadFileSystem();
  const info = await FileSystem.getInfoAsync?.(download.localUri).catch(() => null);
  return Boolean(info?.exists && (info.size == null || Number(info.size) > 0));
}

export async function getLocalDownloadForTrack(trackId: string) {
  if (!trackId) return null;
  const stored = await readStoredDownloads();
  const download = stored[trackId];
  if (!download?.localUri || download.status !== 'completed') return null;
  const FileSystem = await loadFileSystem();
  const info = await FileSystem.getInfoAsync?.(download.localUri).catch(() => null);
  return info?.exists && (info.size == null || Number(info.size) > 0) ? download : null;
}

export async function downloadAudioToDevice(
  track: EchooAudio,
  onProgress?: (progress: number) => void
): Promise<LocalDownload> {
  const accountId = await getAccountScope();
  const key = `${accountId}:${track.id}`;
  const existing = activeDownloads.get(key);
  if (existing) return existing;
  const pending = downloadAudioToDeviceImpl(track, accountId, onProgress);
  activeDownloads.set(key, pending);
  activeDownloadTracks.set(key, track);
  try { return await pending; }
  finally { activeDownloads.delete(key); activeDownloadTracks.delete(key); emitStatusChange(); }
}

async function downloadAudioToDeviceImpl(
  track: EchooAudio,
  accountId: string,
  onProgress?: (progress: number) => void
): Promise<LocalDownload> {
  if (!track.id) throw new Error('Audio ID is missing.');
  if (Platform.OS === 'web') throw new Error('Offline downloads are only available in the mobile app.');

  const existing = await getLocalDownloadForTrack(track.id);
  if (existing?.status === 'completed' && existing.localUri) {
    const FileSystem = await loadFileSystem();
    const info = await FileSystem.getInfoAsync?.(existing.localUri).catch(() => null);
    if (info?.exists && (info.size == null || Number(info.size) > 0)) {
      setTrackStatus(track.id, 'completed', 100, accountId);
      onProgress?.(100);
      return existing;
    }
  }

  const FileSystem = await loadFileSystem();
  if (!FileSystem.documentDirectory) throw new Error('Device storage is unavailable.');
  const root = `${FileSystem.documentDirectory}echoo-downloads/${encodeURIComponent(accountId)}/`;

  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  if (await getAccountScope() !== accountId) throw new Error('Your account changed. Please try again.');

  setTrackStatus(track.id, 'downloading', 1, accountId);
  onProgress?.(1);
  let serverDownload: EchooDownload;
  try {
    serverDownload = await requestDownload(track.id);
  } catch (error: any) {
    if (error?.code !== 'ALREADY_DOWNLOADED') {
      setTrackStatus(track.id, 'failed', 0, accountId);
      throw error;
    }
    serverDownload = {
      id: track.id,
      trackId: track.id,
      track,
      status: 'pending',
      progress: 0,
      fileSize: 0,
      downloadedSize: 0,
      quality: 'medium',
    };
  }

  const token = await getAccessToken();
  const destination = `${root}${track.id}.${getExtension(track)}`;
  const options = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
  const url = `${API_URL}/audio/${encodeURIComponent(track.id)}/download`;

  try {
    const result = FileSystem.createDownloadResumable
      ? await FileSystem.createDownloadResumable(url, destination, options, (data) => {
        const expected = Number(data.totalBytesExpectedToWrite) || 0;
        const written = Number(data.totalBytesWritten) || 0;
        const progress = expected > 0
          ? Math.max(1, Math.min(99, Math.round((written / expected) * 100)))
          : 1;
        setTrackStatus(track.id, 'downloading', progress, accountId);
        onProgress?.(progress);
        }).downloadAsync()
      : await FileSystem.downloadAsync(url, destination, options);

    if (!result || result.status !== 200) {
      throw new Error('Could not save this audio for offline listening.');
    }

    const headers = Object.fromEntries(Object.entries(result.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (/json|text\/html/i.test(headers['content-type'] || '')) throw new Error('The server did not return an audio file.');

    const info = await FileSystem.getInfoAsync?.(result.uri);
    if (info && (!info.exists || !(Number(info.size) > 0))) {
      throw new Error('The downloaded audio file is empty or missing.');
    }
    const expectedSize = Number(headers['content-length']);
    if (info?.size != null && expectedSize > 0 && info.size !== expectedSize) throw new Error('The audio download is incomplete. Please try again.');

    const completed: LocalDownload = {
      ...serverDownload,
      trackId: track.id,
      track,
      status: 'completed',
      progress: 100,
      localUri: result.uri,
      createdAt: serverDownload.createdAt || new Date().toISOString(),
    };

    if (await getAccountScope() !== accountId) {
      throw new Error('The signed-in account changed during this download. Please try again.');
    }
    await mutateStoredDownloads((stored) => {
      stored[track.id] = completed;
    }, accountId);
    setTrackStatus(track.id, 'completed', 100, accountId);
    onProgress?.(100);

    if (serverDownload.id !== track.id && await getOptionalAccountScope() === accountId) {
      await updateDownloadProgress(serverDownload.id, { status: 'completed', progress: 100 }).catch(() => undefined);
    }

    return completed;
  } catch (error) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    if (serverDownload.id !== track.id && await getOptionalAccountScope() === accountId) {
      await updateDownloadProgress(serverDownload.id, { status: 'failed', progress: 0 }).catch(() => undefined);
    }
    setTrackStatus(track.id, 'failed', 0, accountId);
    throw error;
  }
}

export async function deleteLocalDownload(download: LocalDownload) {
  const accountId = await getAccountScope();
  const { FileSystem, directory } = await downloadIndexLocation(accountId);
  if (activeDownloads.has(`${accountId}:${download.trackId}`)) throw new Error('Wait for this download to finish before removing it.');
  if (download.localUri && (!download.localUri.startsWith(directory) || download.localUri.slice(directory.length).includes('/'))) {
    throw new Error('This offline file belongs to a different Echoo account.');
  }
  if (download.localUri && Platform.OS !== 'web') {
    await FileSystem.deleteAsync(download.localUri, { idempotent: true });
  }

  await mutateStoredDownloads((stored) => {
    delete stored[download.trackId];
  }, accountId);
  statusSnapshot.delete(download.trackId);
  emitStatusChange();
}
