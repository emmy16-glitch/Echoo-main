import test from 'node:test';
import assert from 'node:assert/strict';

import { app } from '../src/app.js';

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

test('direct /uploads/audio paths are not publicly reachable', async () => {
  let server = null;
  try {
    server = await new Promise((resolve, reject) => {
      const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
      candidate.once('error', reject);
    });
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/uploads/audio/not-public.mp3`
    );
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body?.error?.code, 'DIRECT_AUDIO_STORAGE_BLOCKED');
  } finally {
    if (server) await closeServer(server);
  }
});
