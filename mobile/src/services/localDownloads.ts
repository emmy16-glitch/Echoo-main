import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  API_URL,
  EchooAudio,
  EchooDownload,
  getAccessToken,
  removeDownload,
  requestDownload,
  updateDownloadProgress,
} from '@/src/services/echooApi';

type FileSystemModule = {
  documentDirectory?: string | null;
  makeDirectoryAsync: (fileUri: string, options?: { intermediates?: boolean }) => Promise<void>;
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

const STORE_KEY = 'echoo.localDownloads.v1';
const MEMORY_STORE: { value: string } = { value: '[]' };
const statusListeners = new Set<() => void>();
const statusSnapshot = new Map<string, { status: LocalDownload['status']; progress: number }>();

function emitStatusChange() {
  statusListeners.forEach((listener) => listener());
}

function setTrackStatus(trackId: string, status: LocalDownload['status'], progress: number) {
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

async function getAccountScope() {
  const token = await getAccessToken();
  const encodedPayload = token?.split('.')[1];
  if (!encodedPayload) throw new Error('Sign in to manage offline downloads.');
  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded));
    const accountId = payload.userId || payload.sub || payload.id || payload._id;
    if (accountId) return String(accountId);
  } catch { /* fail closed below; unscoped files could leak between accounts */ }
  throw new Error('Could not identify the signed-in account for offline storage.');
}

async function localStoreKey() {
  return `${STORE_KEY}:${await getAccountScope()}`;
}

async function readStoredDownloads(): Promise<Record<string, LocalDownload>> {
  const key = await localStoreKey();
  const raw = Platform.OS === 'web'
    ? MEMORY_STORE.value
    : await SecureStore.getItemAsync(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStoredDownloads(downloads: Record<string, LocalDownload>) {
  const key = await localStoreKey();
  const serialized = JSON.stringify(downloads);
  if (Platform.OS === 'web') {
    MEMORY_STORE.value = serialized;
    return;
  }
  await SecureStore.setItemAsync(key, serialized);
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
  const validStored: Record<string, LocalDownload> = {};
  for (const [trackId, download] of Object.entries(stored)) {
    const info = download.localUri && FileSystem?.getInfoAsync
      ? await FileSystem.getInfoAsync(download.localUri).catch(() => ({ exists: false }))
      : { exists: false };
    if (download.status === 'completed' && download.localUri && info.exists && (info.size == null || Number(info.size) > 0)) {
      rows.push(download);
      validStored[trackId] = download;
    }
  }
  if (Object.keys(validStored).length !== Object.keys(stored).length) await writeStoredDownloads(validStored);
  statusSnapshot.clear();
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
  return stored[trackId] || null;
}

export async function downloadAudioToDevice(
  track: EchooAudio,
  onProgress?: (progress: number) => void
): Promise<LocalDownload> {
  if (!track.id) throw new Error('Audio ID is missing.');
  if (Platform.OS === 'web') throw new Error('Offline downloads are only available in the mobile app.');

  const accountId = await getAccountScope();
  const existing = await getLocalDownloadForTrack(track.id);
  if (existing?.status === 'completed' && existing.localUri) {
    const FileSystem = await loadFileSystem();
    const info = await FileSystem.getInfoAsync?.(existing.localUri).catch(() => null);
    if (info?.exists && (info.size == null || Number(info.size) > 0)) {
      setTrackStatus(track.id, 'completed', 100);
      onProgress?.(100);
      return existing;
    }
  }

  const FileSystem = await loadFileSystem();
  if (!FileSystem.documentDirectory) throw new Error('Device storage is unavailable.');
  const root = `${FileSystem.documentDirectory}echoo-downloads/${encodeURIComponent(accountId)}/`;

  await FileSystem.makeDirectoryAsync(root, { intermediates: true }).catch(() => undefined);

  setTrackStatus(track.id, 'downloading', 1);
  onProgress?.(1);
  let serverDownload: EchooDownload;
  try {
    serverDownload = await requestDownload(track.id);
  } catch (error: any) {
    if (error?.code !== 'ALREADY_DOWNLOADED') {
      setTrackStatus(track.id, 'failed', 0);
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
        setTrackStatus(track.id, 'downloading', progress);
        onProgress?.(progress);
        }).downloadAsync()
      : await FileSystem.downloadAsync(url, destination, options);

    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error('Could not download this audio to your device.');
    }

    const info = await FileSystem.getInfoAsync?.(result.uri);
    if (info && (!info.exists || !(Number(info.size) > 0))) {
      throw new Error('The downloaded audio file is empty or missing.');
    }

    const completed: LocalDownload = {
      ...serverDownload,
      trackId: track.id,
      track,
      status: 'completed',
      progress: 100,
      localUri: result.uri,
      createdAt: serverDownload.createdAt || new Date().toISOString(),
    };

    const stored = await readStoredDownloads();
    stored[track.id] = completed;
    await writeStoredDownloads(stored);
    setTrackStatus(track.id, 'completed', 100);
    onProgress?.(100);

    if (serverDownload.id !== track.id) {
      await updateDownloadProgress(serverDownload.id, { status: 'completed', progress: 100 }).catch(() => undefined);
    }

    return completed;
  } catch (error) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    if (serverDownload.id !== track.id) {
      await updateDownloadProgress(serverDownload.id, { status: 'failed', progress: 0 }).catch(() => undefined);
    }
    setTrackStatus(track.id, 'failed', 0);
    throw error;
  }
}

export async function deleteLocalDownload(download: LocalDownload) {
  const accountId = await getAccountScope();
  const accountDirectory = `/echoo-downloads/${encodeURIComponent(accountId)}/`;
  if (download.localUri && !download.localUri.includes(accountDirectory)) {
    throw new Error('This offline file belongs to a different Echoo account.');
  }
  if (download.localUri && Platform.OS !== 'web') {
    const FileSystem = await loadFileSystem();
    await FileSystem.deleteAsync(download.localUri, { idempotent: true }).catch(() => undefined);
  }

  if (download.id && download.id !== download.trackId) {
    await removeDownload(download.id).catch(() => undefined);
  }

  const stored = await readStoredDownloads();
  delete stored[download.trackId];
  await writeStoredDownloads(stored);
  statusSnapshot.delete(download.trackId);
  emitStatusChange();
}
