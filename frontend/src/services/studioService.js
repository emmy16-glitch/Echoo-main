import {
  API_BASE_URL,
  apiFetch,
  apiRequest,
  buildMediaUrl,
  getCurrentAccessToken,
  refreshSessionAccessToken,
} from "./api.js";

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
  if (String(originalName || "").trim()) return String(originalName).trim();
  const base = String(title || "echoo-audio")
    .trim()
    .replace(/[^a-z0-9-_ ]+/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 90) || "echoo-audio";
  return `${base}${extensionForMime(mimeType)}`;
};

let fallbackPlaybackObjectUrl = "";

const releaseFallbackPlaybackUrl = () => {
  if (!fallbackPlaybackObjectUrl || typeof URL === "undefined") return;
  URL.revokeObjectURL(fallbackPlaybackObjectUrl);
  fallbackPlaybackObjectUrl = "";
};

const missingStreamTokenRoute = (error) =>
  Number(error?.status) === 404 &&
  (
    error?.code === "ROUTE_NOT_FOUND" ||
    error?.data?.error?.code === "ROUTE_NOT_FOUND" ||
    /route not found/i.test(String(error?.message || ""))
  );

const getCompatibilityPlaybackUrl = async (audioId) => {
  const response = await apiFetch(`/audio/${encodeURIComponent(audioId)}/download`);

  if (!response.ok) {
    let message = "Could not prepare this audio for playback.";
    let code = "PLAYBACK_FALLBACK_FAILED";
    try {
      const data = await response.json();
      message = data?.error?.message || data?.message || message;
      code = data?.error?.code || code;
    } catch {
      // Keep the safe fallback message for non-JSON failures.
    }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
  }

  const blob = await response.blob();
  releaseFallbackPlaybackUrl();
  fallbackPlaybackObjectUrl = URL.createObjectURL(blob);
  return {
    streamUrl: fallbackPlaybackObjectUrl,
    expiresIn: 0,
    compatibilityFallback: true,
  };
};

const studioService = {
  getDashboard: async () => apiRequest("/studio/dashboard"),

  getContent: async ({ page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    return apiRequest(`/studio/content?${params.toString()}`);
  },

  getAudience: async () => apiRequest("/studio/audience"),

  getAnalytics: async (period = "30d") => {
    const params = new URLSearchParams();
    params.set("period", period);
    return apiRequest(`/studio/analytics?${params.toString()}`);
  },

  getAudioStreamUrl: async (audioId) => {
    if (!audioId) throw new Error("Audio ID is missing.");

    try {
      const response = await apiRequest(
        `/audio/${encodeURIComponent(audioId)}/stream-token`,
        { method: "POST" }
      );
      const streamUrl = buildMediaUrl(response?.data?.streamUrl || "");
      if (!streamUrl) throw new Error("Echoo could not prepare this audio for playback.");
      return {
        streamUrl,
        expiresIn: Number(response?.data?.expiresIn) || 0,
        compatibilityFallback: false,
      };
    } catch (error) {
      // A browser can stay open while a developer/server process is still running
      // an older Echoo backend that predates /stream-token. Do not surface the
      // generic "Route not found" banner to creators in that transitional state.
      // Use the existing authenticated download route as a temporary in-memory
      // playback source. The protected Range stream remains the primary path and
      // is used automatically as soon as the backend exposes it.
      if (!missingStreamTokenRoute(error)) throw error;
      return getCompatibilityPlaybackUrl(audioId);
    }
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

    // apiFetch returns the raw Response but still performs Echoo's normal
    // access-token refresh/retry. Large downloads therefore do not randomly fail
    // with a stale access token after a long Creator Studio session.
    const response = await apiFetch(
      `/audio/${encodeURIComponent(audioId)}/download`
    );

    if (!response.ok) {
      let message = "Could not download this audio.";
      try {
        const data = await response.json();
        message = data?.error?.message || data?.message || message;
      } catch {
        // Non-JSON failures keep the safe fallback message.
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const total = Math.max(0, Number(response.headers.get("content-length")) || 0);
    const onProgress = typeof metadata?.onProgress === "function" ? metadata.onProgress : null;
    let blob;

    if (onProgress && response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      onProgress({ loaded: 0, total, percent: total > 0 ? 0 : null });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          chunks.push(value);
          loaded += value.byteLength;
          onProgress({
            loaded,
            total,
            percent: total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : null,
          });
        }
      }

      blob = new Blob(chunks, {
        type: response.headers.get("content-type") || metadata?.mimeType || "application/octet-stream",
      });
      onProgress({ loaded: blob.size, total: total || blob.size, percent: 100 });
    } else {
      blob = await response.blob();
      onProgress?.({ loaded: blob.size, total: total || blob.size, percent: 100 });
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeDownloadName({
      ...metadata,
      mimeType: metadata?.mimeType || blob.type,
    });
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    return { size: blob.size, mimeType: blob.type };
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
          data = null;
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
};

export default studioService;
