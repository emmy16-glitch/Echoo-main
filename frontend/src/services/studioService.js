import { apiRequest, API_BASE_URL } from "./api.js";

const readResponse = async (response) => {
  const contentType =
    response.headers.get("content-type") || "";

  let data = null;

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    data = await response.json();
  } else {
    const text =
      await response.text();

    data = text
      ? { message: text }
      : null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
        data?.message ||
        "The request could not be completed."
    );

    error.code =
      data?.error?.code ||
      "REQUEST_FAILED";

    error.status =
      response.status;

    throw error;
  }

  return data;
};

const studioService = {
  getDashboard: async () => {
    return apiRequest(
      "/studio/dashboard"
    );
  },

  getContent: async ({
    page = 1,
    limit = 20,
  } = {}) => {
    const params =
      new URLSearchParams();

    params.set(
      "page",
      String(page)
    );

    params.set(
      "limit",
      String(limit)
    );

    return apiRequest(
      `/studio/content?${params.toString()}`
    );
  },

  getAudience: async () => {
    return apiRequest(
      "/studio/audience"
    );
  },

  getAnalytics: async (
    period = "30d"
  ) => {
    const params =
      new URLSearchParams();

    params.set(
      "period",
      period
    );

    return apiRequest(
      `/studio/analytics?${params.toString()}`
    );
  },

  deleteAudio: async (
    audioId
  ) => {
    if (!audioId) {
      throw new Error(
        "Audio ID is missing."
      );
    }

    return apiRequest(
      `/audio/${audioId}`,
      {
        method: "DELETE",
      }
    );
  },

  uploadAudio: async ({
    file,
    title,
    description = "",
    genre = "Other",
    tags = [],
    isPublic = true,
  }) => {
    if (!file) {
      throw new Error(
        "Please choose an audio file."
      );
    }

    const accessToken =
      localStorage.getItem(
        "accessToken"
      );

    if (!accessToken) {
      throw new Error(
        "Your session is missing. Please sign in again."
      );
    }

    const formData =
      new FormData();

    formData.append(
      "audio",
      file
    );

    formData.append(
      "title",
      title?.trim() ||
        file.name
    );

    formData.append(
      "description",
      description.trim()
    );

    formData.append(
      "genre",
      genre || "Other"
    );

    formData.append(
      "tags",
      JSON.stringify(
        Array.isArray(tags)
          ? tags
          : []
      )
    );

    formData.append(
      "isPublic",
      isPublic
        ? "true"
        : "false"
    );

    const response =
      await fetch(
        `${API_BASE_URL}/audio/upload`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          body: formData,
        }
      );

    return readResponse(
      response
    );
  },
};

export default studioService;