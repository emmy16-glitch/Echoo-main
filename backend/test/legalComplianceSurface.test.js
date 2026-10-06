import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('public privacy policy and account deletion routes stay available', async () => {
  const app = await source('../../frontend/src/App.jsx');
  assert.match(app, /path="\/privacy-policy"/);
  assert.match(app, /path="\/delete-account"/);
});

test('web deletion UI stays wired to the authenticated Settings endpoint', async () => {
  const service = await source('../../frontend/src/services/settingsService.js');
  const page = await source('../../frontend/src/Components/Legal/DeleteAccount.jsx');
  assert.match(service, /method:\s*'DELETE'/);
  assert.match(service, /['"]\/settings\/account['"]/);
  assert.match(page, /settingsService\.deleteAccount\(password\)/);
  assert.match(page, /clearAuthTokens\(\)/);
});

test('mobile Settings exposes privacy and in-app account deletion', async () => {
  const settings = await source('../../mobile/app/settings.tsx');
  const accountPage = await source('../../mobile/app/delete-account.tsx');
  const api = await source('../../mobile/src/services/echooApi.ts');
  assert.match(settings, /https:\/\/echoo\.digi02\.org\/privacy-policy/);
  assert.match(settings, /router\.push\('\/delete-account'\)/);
  assert.match(accountPage, /deleteEchooAccount\(password\)/);
  assert.match(api, /['"]\/settings\/account['"]/);
});

test('sign-in can return to the deletion page', async () => {
  const app = await source('../../frontend/src/App.jsx');
  const gate = await source('../../frontend/src/Components/Auth/GuestAuthGate.jsx');
  assert.match(app, /safeReturnToFrom/);
  assert.match(app, /\/delete-account/);
  assert.match(gate, /destinationOverride/);
});
