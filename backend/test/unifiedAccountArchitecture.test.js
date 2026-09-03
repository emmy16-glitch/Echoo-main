import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('account authentication defaults to Listener and Channel setup is a separate route', async () => {
  const app = await source('../../frontend/src/App.jsx');

  assert.match(app, /path="\/create-channel"/);
  assert.match(app, /saveActiveExperience\('listener'\)/);
  assert.doesNotMatch(app, /stage === 'creator'/);
  assert.doesNotMatch(app, /ChooseRole/);
});

test('experience switching uses account-scoped state and never performs another login', async () => {
  const experience = await source('../../frontend/src/services/accountExperience.js');

  assert.match(experience, /accountStorageKey\('echooActiveExperience'\)/);
  assert.match(experience, /route: '\/create-channel'/);
  assert.match(experience, /route: '\/creator-studio'/);
  assert.match(experience, /route: '\/listen'/);
  assert.doesNotMatch(experience, /auth\.login|\/login/);
});

test('activating Creator cannot reset shared Listener onboarding', async () => {
  const controller = await source('../src/controllers/onboardingController.js');

  assert.match(controller, /creatorOnboardingCompleted = false/);
  assert.match(controller, /profileCompleted = true/);
  assert.doesNotMatch(controller, /onboardingCompleted = false/);
});

test('Creator and Listener stay on the same authenticated user model', async () => {
  const model = await source('../src/models/User.js');

  assert.match(model, /capabilities = \{/);
  assert.match(model, /listener: true/);
  assert.match(model, /creatorOnboardingCompleted/);
  assert.match(model, /profileCompleted/);
});
