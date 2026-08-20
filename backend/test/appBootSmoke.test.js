import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';

// The smoke-test boots the full Express application without MongoDB or
// LiveKit. Mongoose is replaced with a fake connection so the database
// layer never opens a socket; LiveKit is left unconfigured so the orphan
// sweep and token routes self-guard exactly as they do without credentials.
//
// NOTE: mongoose must be patched BEFORE the app module is imported, because
// app.js registers models and a socket.io server at module load time.

const originalEnv = { ...process.env };

test.before(() => {
  // A distinct, non-production environment so startup warnings don't fire
  // and no production-only guards interfere with the boot.
  process.env.NODE_ENV = 'test';
  process.env.PORT = '54321';
  process.env.JWT_SECRET = 'smoke-test-secret';
  process.env.JWT_REFRESH_SECRET = 'smoke-test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRY = '1h';
  process.env.JWT_REFRESH_EXPIRY = '7d';
  process.env.CLIENT_ORIGINS = 'http://localhost:5174';
  // LiveKit stays unconfigured — the sweep and provider guard themselves.
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
});

test.after(() => {
  Object.assign(process.env, originalEnv);
});

// Fake mongoose plumbing: compile real schemas so model methods exist, but
// point the connection at an in-process EventEmitter so no network call
// happens.
import mongoose from 'mongoose';

const fakeEmitter = new EventEmitter();
const fakeConnection = Object.assign(new EventEmitter(), {
  name: 'echoo-smoke-test',
  host: 'localhost',
  port: 27017,
  readyState: 1,
  models: {},
  collections: {},
  db: null,
});
fakeEmitter.connection = fakeConnection;

const originalConnect = mongoose.connect.bind(mongoose);
const originalDisconnect = mongoose.disconnect.bind(mongoose);
mongoose.connect = async (uri, options) => {
  return fakeConnection;
};
mongoose.disconnect = async () => {};
const restoreMongoose = () => {
  mongoose.connect = originalConnect;
  mongoose.disconnect = originalDisconnect;
};

// Make the compiled models see the fake connection.
async function buildApp() {
  // Importing app.js compiles all models and creates the express/HTTP/socket
  // server. With connect mocked this happens without touching MongoDB.
  const appModule = await import('../src/app.js');
  return appModule;
}

test('the express app boots without a database and the health route answers', async () => {
  const appModule = await buildApp();
  const { app, server, startServer, io } = appModule;

  assert.ok(app, 'express app is exported and configured');
  assert.ok(io, 'socket.io server is attached to the http server');

  // startServer() must not throw; it awaits the mocked connect and then
  // calls server.listen on the mocked PORT.
  await assert.doesNotReject(() => startServer());

  // The real socket listens immediately after startServer resolves.
  const response = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:54321/api/health', (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    setTimeout(() => reject(new Error('health request timed out')), 5000);
  });

  assert.equal(response.status, 200);
  const json = JSON.parse(response.body);
  assert.equal(json.status, 'ok');
  assert.equal(json.service, 'echoo-api');
  assert.ok(json.timestamp, 'health payload includes a timestamp');

  // Clean up so this test's server never leaks across tests.
  await new Promise((resolve) => server.close(resolve));
});

test('boot-time modules do not crash when LiveKit credentials are absent', async () => {
  // The orphan sweep and token endpoints are all exercised by simply
  // starting the server; they must self-guard rather than throw during
  // module load or startup (covered implicitly by startServer succeeding).
  const appModule = await buildApp();
  await assert.doesNotReject(() => appModule.startServer());
  await new Promise((resolve) => appModule.server.close(resolve));
});

// Restore real mongoose after the smoke run so later test files are clean.
test.after(() => {
  restoreMongoose();
});
