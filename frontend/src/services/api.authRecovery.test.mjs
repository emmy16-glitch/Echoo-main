import assert from 'node:assert/strict';
import test from 'node:test';

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

const loadApi = async ({ fetchImpl } = {}) => {
  const replacements = [];
  globalThis.localStorage = createStorage({
    accessToken: 'expired-access',
    token: 'expired-access',
    refreshToken: 'still-valid-refresh',
    user: JSON.stringify({ id: 'user-1' }),
  });
  globalThis.sessionStorage = createStorage({ creatorDraft: 'keep-until-real-signout' });
  globalThis.window = {
    // file: exercises the packaged HashRouter expiry path while localhost
    // supplies the normal development API base in this dependency-free test.
    echooDesktop: undefined,
    location: {
      hostname: 'localhost',
      protocol: 'file:',
      replace: (value) => replacements.push(value),
    },
  };
  globalThis.fetch = fetchImpl;

  const api = await import(`./api.js?auth-recovery=${Date.now()}-${Math.random()}`);
  return { api, replacements };
};

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('offline token refresh preserves desktop authentication for reconnect', async () => {
  let requestCount = 0;
  const { api, replacements } = await loadApi({
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1 || requestCount === 3) {
        return jsonResponse(401, { error: { code: 'AUTH_INVALID' } });
      }
      if (requestCount === 2) throw new TypeError('Failed to fetch');
      if (requestCount === 4) {
        return jsonResponse(200, {
          data: { accessToken: 'reconnected-access', refreshToken: 'rotated-refresh' },
        });
      }
      return jsonResponse(200, { data: { recovered: true } });
    },
  });

  await assert.rejects(
    api.apiRequest('/protected'),
    (error) => error?.code === 'NETWORK_UNAVAILABLE' && !/Failed to fetch/i.test(error.message)
  );
  assert.equal(localStorage.getItem('accessToken'), 'expired-access');
  assert.equal(localStorage.getItem('refreshToken'), 'still-valid-refresh');
  assert.equal(localStorage.getItem('user'), JSON.stringify({ id: 'user-1' }));
  assert.deepEqual(replacements, []);

  const recovered = await api.apiRequest('/protected');
  assert.equal(recovered?.data?.recovered, true);
  assert.equal(localStorage.getItem('accessToken'), 'reconnected-access');
  assert.equal(localStorage.getItem('refreshToken'), 'rotated-refresh');
  assert.deepEqual(replacements, []);
});

test('refresh service failure preserves desktop authentication', async () => {
  let requestCount = 0;
  const { api, replacements } = await loadApi({
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return jsonResponse(401, { error: { code: 'AUTH_INVALID' } });
      }
      return jsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
    },
  });

  await assert.rejects(
    api.apiRequest('/protected'),
    (error) => error?.status === 503 && /temporarily unavailable/i.test(error.message)
  );
  assert.equal(localStorage.getItem('refreshToken'), 'still-valid-refresh');
  assert.deepEqual(replacements, []);
});

test('refresh timeout preserves desktop authentication', async () => {
  let requestCount = 0;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  try {
    const { api, replacements } = await loadApi({
      fetchImpl: async (_url, options = {}) => {
        requestCount += 1;
        if (requestCount === 1) {
          return jsonResponse(401, { error: { code: 'AUTH_INVALID' } });
        }
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true }
          );
        });
      },
    });

    await assert.rejects(
      api.apiRequest('/protected'),
      (error) => error?.code === 'REQUEST_TIMEOUT' && /too long/i.test(error.message)
    );
    assert.equal(localStorage.getItem('refreshToken'), 'still-valid-refresh');
    assert.deepEqual(replacements, []);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('malformed refresh success preserves desktop authentication', async () => {
  let requestCount = 0;
  const { api, replacements } = await loadApi({
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return jsonResponse(401, { error: { code: 'AUTH_INVALID' } });
      }
      return jsonResponse(200, { data: {} });
    },
  });

  await assert.rejects(
    api.apiRequest('/protected'),
    /Backend did not return a new access token/
  );
  assert.equal(localStorage.getItem('refreshToken'), 'still-valid-refresh');
  assert.deepEqual(replacements, []);
});

test('explicitly invalid refresh token clears auth and uses the packaged login route', async () => {
  let requestCount = 0;
  const { api, replacements } = await loadApi({
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return jsonResponse(401, { error: { code: 'AUTH_INVALID' } });
      }
      return jsonResponse(401, {
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid.' },
      });
    },
  });

  await assert.rejects(
    api.apiRequest('/protected'),
    (error) => error?.code === 'SESSION_EXPIRED'
  );
  assert.equal(localStorage.getItem('accessToken'), null);
  assert.equal(localStorage.getItem('refreshToken'), null);
  assert.equal(localStorage.getItem('user'), null);
  assert.deepEqual(replacements, ['#/login?reason=session-expired']);
});

test('session expiry classification distinguishes auth rejection from recoverable outages', async () => {
  const { api } = await loadApi({
    fetchImpl: async () => jsonResponse(200, { data: {} }),
  });

  assert.equal(api.isDefinitiveSessionExpiry({ code: 'INVALID_REFRESH_TOKEN' }), true);
  assert.equal(api.isDefinitiveSessionExpiry({ code: 'REFRESH_TOKEN_REQUIRED' }), true);
  assert.equal(api.isDefinitiveSessionExpiry({ status: 401 }), true);
  assert.equal(api.isDefinitiveSessionExpiry({ status: 403 }), true);
  assert.equal(api.isDefinitiveSessionExpiry({ code: 'NETWORK_UNAVAILABLE' }), false);
  assert.equal(api.isDefinitiveSessionExpiry({ code: 'REQUEST_TIMEOUT' }), false);
  assert.equal(api.isDefinitiveSessionExpiry({ status: 503 }), false);
  assert.equal(api.isDefinitiveSessionExpiry(new Error('Malformed refresh response')), false);
});
