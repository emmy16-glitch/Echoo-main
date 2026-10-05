'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const mainSource = fs.readFileSync(path.join(desktopRoot, 'src', 'main.js'), 'utf8');
const buildSource = fs.readFileSync(path.join(desktopRoot, 'scripts', 'build-renderer.mjs'), 'utf8');

test('Windows package identity and artifact are canonical', () => {
  assert.equal(packageJson.version, '2.0.0');
  assert.equal(packageJson.build.productName, 'Echoo');
  assert.equal(packageJson.build.win.artifactName, 'Echoo-Setup-${version}-${arch}.${ext}');
  assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
});

test('packaged runtime loads the local renderer', () => {
  assert.match(mainSource, /loadPackagedRenderer\(\)/);
  assert.match(mainSource, /mainWindow\.loadFile\(PROD_INDEX\)/);
  assert.doesNotMatch(mainSource, /mainWindow\.loadURL\(PUBLIC_APP_ORIGIN\)/);
  assert.ok(packageJson.build.files.includes('frontend-dist/**/*'));
});

test('renderer build embeds only public client configuration', () => {
  assert.match(buildSource, /VITE_API_URL/);
  assert.match(buildSource, /VITE_PUBLIC_APP_ORIGIN/);
  assert.match(buildSource, /VITE_BUILD_BASE: '\.\/'/);
  for (const secretName of [
    'LIVEKIT_API_SECRET',
    'JWT_SECRET',
    'MONGODB_URI',
    'AWS_SECRET_ACCESS_KEY',
    'CSC_KEY_PASSWORD',
  ]) {
    assert.equal(buildSource.includes(secretName), false, `${secretName} must not be a renderer build input`);
  }
});

test('external handoff rejects non-web schemes', () => {
  assert.match(mainSource, /!\['http:', 'https:'\]\.includes\(parsed\.protocol\)/);
  assert.match(mainSource, /blocked external URL scheme/);
});

