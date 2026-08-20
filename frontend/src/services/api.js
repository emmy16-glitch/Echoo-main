const configuredApiBase = String(import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/$/, '');
const localRuntime =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE_URL =
  configuredApiBase ||
  (import.meta.env.DEV || localRuntime ? 'http://localhost:5001/api' : '');

export const API_ORIGIN =
  API_BASE_URL.replace(/\/api\/?$/, '');

const requireApiBaseUrl = () => {
  if (API_BASE_URL) return API_BASE_URL;

  const error = new Error(
    'Echoo production API is not configured. Set VITE_API_URL to the public backend URL ending in /api and redeploy the frontend.'
  );
  error.code = 'ECHOO_API_NOT_CONFIGURED';
  throw error;
};

export const getCurrentAccessToken = () => {
  return (
    localStorage.getItem('accessToken') ||
    localStorage.getItem('token') ||
    ''
  );
};

const getRefreshToken = () => {
  return (
    localStorage.getItem('refreshToken') ||
    ''
  );
};

const saveTokens = ({
  accessToken,
  refreshToken,
}) => {
  if (accessToken) {
    localStorage.setItem(
      'accessToken',
      accessToken
    );

    localStorage.setItem(
      'token',
      accessToken
    );
  }

  if (refreshToken) {
    localStorage.setItem(
      'refreshToken',
      refreshToken
    );
  }
};

const AUTH_LOCAL_STORAGE_KEYS = [
  'accessToken',
  'refreshToken',
  'token',
  'user',
  'profileImage',
  'profileBio',
  'echooRole',
  'echooProfileCompleted',
  'echooOnboardingCompleted',
  'creatorSetup',
];

export const clearAuthTokens = () => {
  AUTH_LOCAL_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });

  // Creator/broadcast setup is session-scoped and must never leak into
  // the next account that signs in on the same browser.
  sessionStorage.clear();
};

const parseResponse = async (
  response
) => {
  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  return data;
};

const createError = (
  response,
  data
) => {
  const error = new Error(
    data?.error?.message ||
      data?.message ||
      `Request failed with status ${response.status}`
  );

  error.code =
    data?.error?.code || null;

  error.status =
    response.status;

  error.data = data;

  return error;
};

let refreshPromise = null;

// Shared by normal API retries and Socket.IO reconnect recovery. Coalescing the
// promise prevents a network flap from rotating the refresh token many times at
// once across API calls and realtime reconnect attempts.
export const refreshSessionAccessToken = async () => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetch(
    `${requireApiBaseUrl()}/auth/refresh`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    }
  )
    .then(async (response) => {
      const data = await parseResponse(response);

      if (!response.ok) {
        throw createError(response, data);
      }

      const newAccessToken = data?.data?.accessToken;
      const newRefreshToken = data?.data?.refreshToken;

      if (!newAccessToken) {
        throw new Error('Backend did not return a new access token');
      }

      saveTokens({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });

      return newAccessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

const makeRequest = async (
  path,
  options = {},
  accessToken = ''
) => {
  const headers = {
    ...(!options.isFormData &&
    options.body
      ? {
          'Content-Type':
            'application/json',
        }
      : {}),
    ...(accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : {}),
    ...options.headers,
  };

  return fetch(
    `${requireApiBaseUrl()}${path}`,
    {
      method:
        options.method || 'GET',
      body: options.body,
      headers,
    }
  );
};

const sessionExpiredError = () => {
  const error = new Error(
    'Your session has expired. Please log in again.'
  );
  error.code = 'SESSION_EXPIRED';
  error.status = 401;
  return error;
};

// Raw-response requests (downloads, multipart uploads, media helpers) must use
// the same access-token refresh path as JSON API calls. Otherwise a creator can
// be signed in successfully yet see an upload/download fail only because the
// short-lived access token expired while the Studio remained open.
export const apiFetch = async (
  path,
  options = {}
) => {
  const {
    skipAuth = false,
    skipRefresh = false,
  } = options;

  const accessToken =
    skipAuth
      ? ''
      : getCurrentAccessToken();

  let response =
    await makeRequest(
      path,
      options,
      accessToken
    );

  if (
    response.status === 401 &&
    !skipAuth &&
    !skipRefresh &&
    getRefreshToken()
  ) {
    try {
      const newAccessToken =
        await refreshSessionAccessToken();

      response =
        await makeRequest(
          path,
          options,
          newAccessToken
        );
    } catch {
      clearAuthTokens();
      throw sessionExpiredError();
    }
  }

  return response;
};

export const apiRequest = async (
  path,
  options = {}
) => {
  const response = await apiFetch(path, options);
  const data = await parseResponse(response);

  if (!response.ok) {
    throw createError(
      response,
      data
    );
  }

  return data;
};

export const buildMediaUrl = (
  fileUrl
) => {
  if (!fileUrl) {
    return null;
  }

  if (
    fileUrl.startsWith(
      'http://'
    ) ||
    fileUrl.startsWith(
      'https://'
    ) ||
    fileUrl.startsWith(
      'blob:'
    ) ||
    fileUrl.startsWith(
      'data:'
    )
  ) {
    return fileUrl;
  }

  const origin = API_ORIGIN || (localRuntime ? 'http://localhost:5001' : '');
  if (!origin) return fileUrl;

  return `${origin}${
    fileUrl.startsWith('/')
      ? fileUrl
      : `/${fileUrl}`
  }`;
};

export const api = {
  auth: {
    register: async (
      userData
    ) => {
      const response =
        await apiRequest(
          '/auth/register',
          {
            method: 'POST',
            body: JSON.stringify(
              userData
            ),
            skipAuth: true,
            skipRefresh: true,
          }
        );

      saveTokens({
        accessToken:
          response?.data
            ?.accessToken,
        refreshToken:
          response?.data
            ?.refreshToken,
      });

      return response;
    },

    login: async (
      credentials
    ) => {
      const response =
        await apiRequest(
          '/auth/login',
          {
            method: 'POST',
            body: JSON.stringify(
              credentials
            ),
            skipAuth: true,
            skipRefresh: true,
          }
        );

      saveTokens({
        accessToken:
          response?.data
            ?.accessToken,
        refreshToken:
          response?.data
            ?.refreshToken,
      });

      return response;
    },

    refreshToken: async (
      refreshToken
    ) => {
      const response =
        await apiRequest(
          '/auth/refresh',
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken,
            }),
            skipAuth: true,
            skipRefresh: true,
          }
        );

      saveTokens({
        accessToken:
          response?.data
            ?.accessToken,
        refreshToken:
          response?.data
            ?.refreshToken,
      });

      return response;
    },

    logout: async () => {
      try {
        return await apiRequest(
          '/auth/logout',
          {
            method: 'POST',
          }
        );
      } finally {
        clearAuthTokens();
      }
    },

    getCurrentUser:
      async () => {
        return apiRequest(
          '/auth/me'
        );
      },

    forgotPassword:
      async (email) => {
        return apiRequest(
          '/auth/forgot-password',
          {
            method: 'POST',
            body: JSON.stringify({
              email,
            }),
            skipAuth: true,
            skipRefresh: true,
          }
        );
      },
  },

  users: {
    me: async () => {
      return apiRequest(
        '/users/me'
      );
    },

    update: async (
      userId,
      data
    ) => {
      return apiRequest(
        `/users/${userId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(
            data
          ),
        }
      );
    },
  },

  health: async () => {
    return apiRequest(
      '/health',
      {
        skipAuth: true,
        skipRefresh: true,
      }
    );
  },
};

export default api;
