import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = (relativePath) =>
  fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('feedback endpoint requires authentication and a rate limit', async () => {
  const routes = await source('src/routes/feedbackRoutes.js');
  assert.match(routes, /sensitiveLimiter/);
  assert.match(routes, /authenticate/);
  assert.match(routes, /router\.post\(['"]\/['"].*createFeedback/);
});

test('feedback controller validates type and maximum length', async () => {
  const controller = await source('src/controllers/feedbackController.js');
  assert.match(controller, /typeof message !== 'string'/);
  assert.match(controller, /MAX_FEEDBACK_LENGTH = 2000/);
  assert.match(controller, /Feedback is too long/);
});

test('feedback controller uses a generic client error for storage failures', async () => {
  const controller = await source('src/controllers/feedbackController.js');
  assert.match(controller, /Unable to submit feedback/);
  assert.match(controller, /console\.error/);
  assert.doesNotMatch(controller, /res\.status\(500\)[\s\S]*error\?\.stack/);
});

test('feedback path does not interpolate message into a database command', async () => {
  const controller = await source('src/controllers/feedbackController.js');
  assert.doesNotMatch(controller, /INSERT\s+INTO|UPDATE\s+.*SET|DELETE\s+FROM/i);
  assert.doesNotMatch(controller, /\$\{\s*message\s*\}/);
});
