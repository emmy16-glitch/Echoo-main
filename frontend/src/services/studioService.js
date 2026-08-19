import { apiRequest, API_BASE_URL } from "./api.js";

const readResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) data = await response.json();
  else {
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

    const accessToken = localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (!accessToken) throw new Error("Your session is missing. Please sign in again.");

    const response = await fetch(`${API_BASE_URL}/audio/${encodeURIComponent(audioId)}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

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

    const blob = await response.blob();
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
  }) => {
    if (!file) throw new Error("Please choose an audio file.");

    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) throw new Error("Your session is missing. Please sign in again.");

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

    const response = await fetch(`${API_BASE_URL}/audio/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    return readResponse(response);
  },
};

export default studioService;
