import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./realtimeService.js', import.meta.url), 'utf8');

test('Socket.IO re-handshakes when switching between guest and authenticated identities', () => {
  assert.match(
    source,
    /sharedSocket\.__echooGuest === true && sharedSocket\.connected[\s\S]{0,100}sharedSocket\.disconnect\(\)/
  );
  assert.match(source, /sharedSocket\.__echooGuest = false/);
  assert.match(
    source,
    /sharedSocket\.__echooGuest !== true && sharedSocket\.connected[\s\S]{0,100}sharedSocket\.disconnect\(\)/
  );
  assert.match(source, /sharedSocket\.auth = auth;[\s\S]{0,80}sharedSocket\.__echooGuest = true/);
});

test('Socket.IO authentication recovery always reads the latest access token', () => {
  assert.match(source, /socket\.io\?\.on\?\.\('reconnect_attempt'/);
  assert.match(source, /updateSocketAuth\(\)/);
  assert.match(source, /if \(socket\.__echooGuest\) return/);
});
