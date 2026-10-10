import {
  API_BASE_URL,
  apiFetch,
  apiRequest,
  buildMediaUrl,
  getCurrentAccessToken,
  refreshSessionAccessToken,
} from "./api.js";
import { getActiveAccountId } from "./accountStorage.js";

const readResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || data?.message || "The request could not be completed."
    );
    error.code = data?.error?.code || "REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }

  return data;
};

const readAudioDuration = (file) =>
  new Promise((resolve) => {
    if (!file || typeof Audio === "undefined" || typeof URL === "undefined") {
      resolve(0);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const probe = new Audio();
    let settled = false;

    const finish = (value = 0) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      probe.removeAttribute("src");
      resolve(Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
    };

    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => finish(probe.duration), { once: true });
    probe.addEventListener("error", () => finish(0), { once: true });
    probe.src = objectUrl;
    probe.load();
    window.setTimeout(() => finish(0), 8000);
  });

const extensionForMime = (mimeType = "") => {
  const value = String(mimeType).toLowerCase();
  if (value.includes("webm")) return ".webm";
  if (value.includes("ogg") || value.includes("opus")) return ".ogg";
  if (value.includes("mpeg") || value.includes("mp3")) return ".mp3";
  if (value.includes("wav")) return ".wav";
  if (value.includes("flac")) return ".flac";
  if (value.includes("aac")) return ".aac";
  if (value.includes("mp4") || value.includes("m4a")) return ".m4a";
  return ".audio";
};

const safeDownloadName = ({ title, originalName, mimeType } = {}) => {
  const extension = extensionForMime(mimeType);
  const original = String(originalName || '').trim();
  const originalStem = original
    ? original.replace(/\.[^/.]+$/, '')
    : '';
  const base = String(originalStem || title || 'echoo-audio')
    .trim()
    .replace(/[^a-z0-9-_ ]+/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 90) || 'echoo-audio';

  // The canonical server copy may have been transcoded after upload (for
  // example WAV -> MP3). Never keep the stale original extension on new bytes.
  return extension === '.audio' && original ? original : `${base}${extension}`;
};

// Modern Echoo playback must always use the signed Range stream. Falling back
// to an authenticated full-file Blob is unsafe for long recordings and can
// exhaust mobile memory during a frontend/backend deploy mismatch.
const releaseFallbackPlaybackUrl = () => {};

// Stream grants are scoped to one recording and remain authorization-checked
// by the stream endpoint on every Range request. Reusing a still-valid grant
// removes a needless token round trip when a creator pauses, resumes, or
// returns to Recordings.
const audioStreamUrlCache = new Map();
const audioStreamPending = new Map();
const AUDIO_STREAM_CACHE_EARLY_REFRESH_MS = 60 * 1000;
const audioStreamCacheKey = (audioId) => (getActiveAccountId() || 'guest') + ':' + String(audioId);

const missingStreamTokenRoute = (error) =>
  Number(error?.status) === 404 &&
  (
    error?.code === "ROUTE_NOT_FOUND" ||
    error?.data?.error?.code === "ROUTE_NOT_FOUND" ||
    /route not found/i.test(String(error?.message || ""))
  );

const studioService = {
  getDashboard: async () => apiRequest("/studio/dashboard"),

  getContent: async ({ page = 1, limit = 20, search = "", sort = "latest" } = {}) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (String(search).trim()) params.set("search", String(search).trim());
    if (sort) params.set("sort", String(sort));
    return apiRequest(`/studio/content?${params.toString()}`);
  },

  getAudio: async (audioId) => {
    if (!audioId) throw new Error("Audio ID is missing.");
    return apiRequest(`/audio/${encodeURIComponent(audioId)}`);
  },

  getAudience: async () => apiRequest("/studio/audience"),

  getAnalytics: async (period = "30d") => {
    const params = new URLSearchParams();
    params.set("period", period);
    return apiRequest(`/studio/analytics?${params.toString()}`);
  },

  getAudioStreamUrl: async (audioId) => {
    if (!audioId) throw new Error("Audio ID is missing.");
    const cacheKey = audioStreamCacheKey(audioId);
    const cached = audioStreamUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + cached.refreshBufferMs) {
      return cached.value;
    }
    // Hover prewarming and a click in quick succession must share one signed
    // URL request. Private grants may never be shared across accounts.
    if (audioStreamPending.has(cacheKey)) return audioStreamPending.get(cacheKey);

    const pending = (async () => {
      try {
        const response = await apiRequest(
          "/audio/" + encodeURIComponent(audioId) + "/stream-token",
          { method: "POST" }
        );
        const streamUrl = buildMediaUrl(response?.data?.streamUrl || "");
        const downloadUrl = buildMediaUrl(response?.data?.downloadUrl || "");
        const mixerUrl = buildMediaUrl(response?.data?.mixerUrl || "");
        if (!streamUrl) throw new Error("Echoo could not prepare this audio for playback.");
        const value = {
          streamUrl,
          downloadUrl,
          mixerUrl,
          expiresIn: Number(response?.data?.expiresIn) || 0,
          compatibilityFallback: false,
        };
        const lifetimeMs = Math.max(0, value.expiresIn * 1000);
        if (lifetimeMs > 0) audioStreamUrlCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + lifetimeMs,
          refreshBufferMs: Math.min(AUDIO_STREAM_CACHE_EARLY_REFRESH_MS, Math.floor(lifetimeMs / 5)),
        });
        return value;
      } catch (error) {
        if (!missingStreamTokenRoute(error)) throw error;
        const updating = new Error("Echoo audio streaming is updating. Please retry in a moment.");
        updating.code = "AUDIO_STREAM_UPDATING";
        updating.status = 503;
        throw updating;
      }
    })().finally(() => audioStreamPending.delete(cacheKey));
    audioStreamPending.set(cacheKey, pending);
    return pending;
  },

  releaseFallbackPlaybackUrl,

  updateAudio: async (audioId, data = {}) => {
    if (!audioId) throw new Error("Audio ID is missing.");
    return apiRequest(`/audio/${audioId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  deleteAudio: async (audioId) => {
    if (!audioId) throw new Error("Audio ID is missing.");
    return apiRequest(`/audio/${audioId}`, { method: "DELETE" });
  },

  downloadAudio: async (audioId, metadata = {}) => {
    if (!audioId) throw new Error("Audio ID is missing.");
    if (typeof document === "undefined") {
      throw new Error("Downloads are only available in the Echoo app.");
    }

    const { downloadUrl } = await studioService.getAudioStreamUrl(audioId);
    if (!downloadUrl) {
      const error = new Error("Echoo could not prepare this recording download.");
      error.code = "AUDIO_DOWNLOAD_UNAVAILABLE";
      throw error;
    }

    const filename = safeDownloadName(metadata);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // The native browser download manager owns the transfer from this point.
    // Do not fetch/blob the recording in page memory just to save it.
    return {
      started: true,
      mode: "native-stream",
      filename,
    };
  },

  uploadAudio: async ({
    file,
    coverFile = null,
    title,
    description = "",
    genre = "Other",
    tags = [],
    isPublic = true,
    broadcastId = null,
  }) => {
    if (!file) throw new Error("Please choose an audio file.");

    const duration = await readAudioDuration(file);
    const formData = new FormData();

    formData.append("audio", file);
    if (coverFile) formData.append("cover", coverFile);
    formData.append("title", title?.trim() || file.name);
    formData.append("description", description.trim());
    formData.append("genre", genre || "Other");
    formData.append("tags", JSON.stringify(Array.isArray(tags) ? tags : []));
    formData.append("isPublic", isPublic ? "true" : "false");
    if (duration > 0) formData.append("duration", String(duration));
    if (broadcastId) formData.append("broadcastId", String(broadcastId));

    const response = await apiFetch("/audio/upload", {
      method: "POST",
      body: formData,
      isFormData: true,
    });

    return readResponse(response);
  },

  uploadAudioWithProgress: async ({
    file,
    coverFile = null,
    title,
    description = "",
    genre = "Other",
    tags = [],
    isPublic = true,
    broadcastId = null,
    onProgress,
    timeoutMs = 120000,
    retried = false,
  }) => {
    if (!file) throw new Error("Please choose an audio file.");
    if (!API_BASE_URL) throw new Error("Echoo production API is not configured.");

    const duration = await readAudioDuration(file);
    const formData = new FormData();
    formData.append("audio", file);
    if (coverFile) formData.append("cover", coverFile);
    formData.append("title", title?.trim() || file.name);
    formData.append("description", String(description || "").trim());
    formData.append("genre", genre || "Other");
    formData.append("tags", JSON.stringify(Array.isArray(tags) ? tags : []));
    formData.append("isPublic", isPublic ? "true" : "false");
    if (duration > 0) formData.append("duration", String(duration));
    if (broadcastId) formData.append("broadcastId", String(broadcastId));

    const emit = (loaded, total) => {
      try {
        const percent = total > 0
          ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100)))
          : null;
        onProgress?.({ loaded, total, percent });
      } catch {
        // Progress observers must never break the transfer.
      }
    };

    const sendOnce = (accessToken) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/audio/upload`);
      if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.timeout = Math.max(10000, Number(timeoutMs) || 120000);
      xhr.responseType = "text";
      emit(0, file.size || 0);

      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event?.lengthComputable) emit(event.loaded, event.total);
          else emit(event?.loaded || 0, file.size || 0);
        };
      }

      xhr.onload = () => {
        const status = xhr.status || 0;
        let data = null;
        try {
          const text = String(xhr.responseText || xhr.response || "");
          data = text ? JSON.parse(text) : null;
        } catch {
          // keep data as null when response is not JSON
        }

        if (status >= 200 && status < 300) {
          emit(file.size || 0, file.size || 0);
          resolve(data);
          return;
        }
        if (status === 401 && !retried) {
          resolve({ __echooRetryAuth: true });
          return;
        }

        const error = new Error(
          data?.error?.message || data?.message || `Upload failed (${status || "network"}).`
        );
        error.code = data?.error?.code || (status === 0 ? "UPLOAD_NETWORK_ERROR" : "UPLOAD_FAILED");
        error.status = status;
        reject(error);
      };

      xhr.onerror = () => {
        const error = new Error("Network error during upload. Your local/source file is unchanged — check your connection and retry.");
        error.code = "UPLOAD_NETWORK_ERROR";
        error.status = 0;
        reject(error);
      };

      xhr.ontimeout = () => {
        const error = new Error("Upload timed out. Your source file is unchanged — retry on a stronger connection.");
        error.code = "UPLOAD_TIMEOUT";
        error.status = 0;
        reject(error);
      };

      xhr.onabort = () => {
        const error = new Error("Upload was cancelled.");
        error.code = "UPLOAD_ABORTED";
        error.status = 0;
        reject(error);
      };

      xhr.send(formData);
    });

    const first = await sendOnce(getCurrentAccessToken());
    if (first && first.__echooRetryAuth && !retried) {
      const fresh = await refreshSessionAccessToken().catch(() => "");
      const second = await sendOnce(fresh || getCurrentAccessToken());
      if (second && second.__echooRetryAuth) {
        const error = new Error("Your session has expired. Please log in again.");
        error.code = "SESSION_EXPIRED";
        error.status = 401;
        throw error;
      }
      if (!second || second.__echooRetryAuth) throw new Error("Upload failed.");
      return second;
    }

    if (first && first.__echooRetryAuth) {
      const error = new Error("Your session has expired. Please log in again.");
      error.code = "SESSION_EXPIRED";
      error.status = 401;
      throw error;
    }

    return first;
  },

  uploadAudioResumable: async ({ file, coverFile = null, title, description = '', genre = 'Other', tags = [], isPublic = false, onProgress, onSession, signal }) => {
    if (!file) throw new Error('Please choose an audio file.');
    const duration = await readAudioDuration(file);
    const initiated = await readResponse(await apiFetch('/uploads/initiate', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, fileSize: file.size, mimeType: file.type || 'audio/mpeg' }),
    }));
    const session = initiated?.data;
    if (!session?.uploadId) throw new Error('Echoo could not start this upload.');
    onSession?.(session);
    let offset = Math.max(0, Number(session.offset) || 0);
    const chunkSize = Math.max(1024 * 1024, Number(session.chunkSize) || 5 * 1024 * 1024);
    const pause = (ms) => new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Upload paused', 'AbortError')); }, { once: true });
    });

    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
      const digest = await crypto.subtle.digest('SHA-256', await chunk.arrayBuffer());
      const checksum = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      let attempt = 0;
      while (true) {
        try {
          const body = new FormData();
          body.append('chunk', chunk, `${file.name}.part`);
          body.append('offset', String(offset));
          const response = await fetch(`${API_BASE_URL}/uploads/${encodeURIComponent(session.uploadId)}/chunk`, {
            method: 'POST', signal, body,
            headers: { Authorization: `Bearer ${getCurrentAccessToken()}`, 'Upload-Offset': String(offset), 'Upload-Checksum': `sha256 ${checksum}` },
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const error = new Error(payload?.error?.message || `Upload failed (${response.status}).`);
            error.status = response.status; error.code = payload?.error?.code; error.expectedOffset = payload?.error?.expectedOffset;
            throw error;
          }
          offset = Number(response.headers.get('Upload-Offset')) || offset + chunk.size;
          break;
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') throw error;
          if (error?.code === 'OFFSET_MISMATCH' && Number.isSafeInteger(error.expectedOffset)) { offset = error.expectedOffset; break; }
          if (++attempt >= 5 || (error?.status >= 400 && error?.status < 500)) throw error;
          await pause(Math.min(8000, 500 * (2 ** attempt)));
        }
      }
      onProgress?.({ loaded: offset, total: file.size, percent: Math.round((offset / file.size) * 100) });
    }

    const coverArt = coverFile ? await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(coverFile);
    }) : null;
    const finalized = await readResponse(await apiFetch(`/uploads/${encodeURIComponent(session.uploadId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ title: title?.trim() || file.name, description, genre, tags, isPublic, duration, coverArt }),
    }));
    onProgress?.({ loaded: file.size, total: file.size, percent: 100, finalized: true });
    return finalized;
  },

  cancelResumableUpload: async (uploadId) => {
    if (!uploadId) return;
    return readResponse(await apiFetch(`/uploads/${encodeURIComponent(uploadId)}`, { method: 'DELETE' }));
  },
};

export default studioService;
