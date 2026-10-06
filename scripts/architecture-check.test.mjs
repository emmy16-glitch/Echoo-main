import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { normalizeRepositoryRelativePath } from './architecture-paths.mjs';

const allowedChannelCreators = [
  'frontend/src/Components/CreatorSetup/CreatorSetup.jsx',
  'frontend/src/Components/CreatorStudio/CreatorStationsWorkspace.jsx',
].sort();

test('normalizes Windows repository paths before architecture allowlist comparison', () => {
  const walkedOnWindows = [
    path.win32.join('frontend', 'src', 'Components', 'CreatorSetup', 'CreatorSetup.jsx'),
    path.win32.join(
      'frontend',
      'src',
      'Components',
      'CreatorStudio',
      'CreatorStationsWorkspace.jsx'
    ),
  ];

  assert.deepEqual(
    walkedOnWindows.map(normalizeRepositoryRelativePath).sort(),
    allowedChannelCreators
  );
});

test('keeps POSIX repository paths unchanged', () => {
  const walkedOnPosix = allowedChannelCreators.map((relativePath) =>
    path.posix.join(...relativePath.split('/'))
  );

  assert.deepEqual(
    walkedOnPosix.map(normalizeRepositoryRelativePath).sort(),
    allowedChannelCreators
  );
});
