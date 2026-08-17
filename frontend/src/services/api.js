export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5001/api';

export const API_ORIGIN =
  API_BASE_URL.replace(/\/api\/?$/, '');

const getAccessToken = () => {
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

export const clearAuthTokens = () => {
  localStorage.removeItem(
    'accessToken'
  );

  localStorage.removeItem(
    'refreshToken'
  );

  localStorage.removeItem(
    'token'
  );
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

const refreshAccessToken =
  async () => {
    const refreshToken =
      getRefreshToken();

    if (!refreshToken) {
      throw new Error(
        'No refresh token available'
      );
    }

    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = fetch(
      `${API_BASE_URL}/auth/refresh`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          refreshToken,
        }),
      }
    )
      .then(
        async (response) => {
          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            throw createError(
              response,
              data
            );
          }

          const newAccessToken =
            data?.data
              ?.accessToken;

          const newRefreshToken =
            data?.data
              ?.refreshToken;

          if (!newAccessToken) {
            throw new Error(
              'Backend did not return a new access token'
            );
          }

          saveTokens({
            accessToken:
              newAccessToken,
            refreshToken:
              newRefreshToken,
          });

          return newAccessToken;
        }
      )
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
    `${API_BASE_URL}${path}`,
    {
      method:
        options.method || 'GET',
      body: options.body,
      headers,
    }
  );
};

export const apiRequest = async (
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
      : getAccessToken();

  let response =
    await makeRequest(
      path,
      options,
      accessToken
    );

  let data =
    await parseResponse(
      response
    );

  if (
    response.status === 401 &&
    !skipAuth &&
    !skipRefresh &&
    getRefreshToken()
  ) {
    try {
      const newAccessToken =
        await refreshAccessToken();

      response =
        await makeRequest(
          path,
          options,
          newAccessToken
        );

      data =
        await parseResponse(
          response
        );
    } catch (refreshError) {
      clearAuthTokens();

      const error =
        new Error(
          'Your session has expired. Please log in again.'
        );

      error.code =
        'SESSION_EXPIRED';

      error.status = 401;

      throw error;
    }
  }

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

  return `${API_ORIGIN}${
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