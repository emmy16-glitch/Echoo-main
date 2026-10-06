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

async function readStoredDownloads(): Promise<Record<string, LocalDownload>> {
  const raw = Platform.OS === 'web'
    ? MEMORY_STORE.value
    : await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStoredDownloads(downloads: Record<string, LocalDownload>) {
  const serialized = JSON.stringify(downloads);
  if (Platform.OS === 'web') {
    MEMORY_STORE.value = serialized;
    return;
  }
  await SecureStore.setItemAsync(STORE_KEY, serialized);
}

function getExtension(track: EchooAudio) {
  const source = track.fileUrl || '';
  const clean = source.split('?')[0] || '';
  const match = clean.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : 'mp3';
}

export async function getLocalDownloads(): Promise<LocalDownload[]> {
  const stored = await readStoredDownloads();
  const rows = Object.values(stored).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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
  return stored[trackId]?.status === 'completed' && Boolean(stored[trackId]?.localUri);
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

  const existing = await getLocalDownloadForTrack(track.id);
  if (existing?.status === 'completed' && existing.localUri) {
    setTrackStatus(track.id, 'completed', 100);
    onProgress?.(100);
    return existing;
  }

  const FileSystem = await loadFileSystem();
  const root = `${FileSystem.documentDirectory || ''}echoo-downloads/`;
  if (!root) throw new Error('Device storage is unavailable.');

  await FileSystem.makeDirectoryAsync(root, { intermediates: true }).catch(() => undefined);

  let serverDownload: EchooDownload;
  try {
    serverDownload = await requestDownload(track.id);
  } catch (error: any) {
    if (error?.code !== 'ALREADY_DOWNLOADED') throw error;
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

  setTrackStatus(track.id, 'downloading', 1);
  onProgress?.(1);

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
    if (serverDownload.id !== track.id) {
      await updateDownloadProgress(serverDownload.id, { status: 'failed', progress: 0 }).catch(() => undefined);
    }
    setTrackStatus(track.id, 'failed', 0);
    throw new Error('Could not download this audio to your device.');
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
}

export async function deleteLocalDownload(download: LocalDownload) {
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
