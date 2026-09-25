import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('live listener keeps playback intent, device volume, and explicit recovery actions', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /playbackIntentRef\s*=\s*useRef\('play'\)/);
  assert.match(player, /volumeRef\s*=\s*useRef\(1\)/);
  assert.match(player, /mutedRef\s*=\s*useRef\(false\)/);
  assert.match(player, /element\.volume\s*=\s*volumeRef\.current/);
  assert.match(player, /element\.muted\s*=\s*mutedRef\.current/);
  assert.match(player, /onReconnect:\s*\(\)\s*=>\s*setRetryVersion/);
  assert.match(player, /const onOnline[\s\S]*scheduleHardReconnect\('browser_online'\)/);
  assert.match(player, /isPlaying,/);
  assert.match(player, /playbackState:/);

  assert.match(player, /setActionHandler\('play',\s*\(\)\s*=>\s*\{\s*void playAudio\(\)/);
  assert.match(player, /setActionHandler\('pause',\s*pauseAudio\)/);
  assert.match(player, /setActionHandler\('stop',\s*stopAudio\)/);
  assert.doesNotMatch(player, /setActionHandler\('pause',[\s\S]{0,80}togglePlayback/);
});

test('live room primary control recovers disconnected audio and never relies on playerError to disable Play', async () => {
  const room = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');

  assert.match(room, /needsReconnect\s*=\s*Boolean\(liveState\?\.canReconnect\)/);
  assert.match(room, /liveState\?\.onReconnect\?\.\(\)/);
  assert.match(room, /disabled=\{primaryPlaybackDisabled\}/);
  assert.doesNotMatch(room, /disabled=\{!isLive\s*\|\|\s*Boolean\(liveState\?\.playerError\)\}/);
  assert.match(room, /disabled=\{!isLive\s*\|\|\s*!hasProgramTrack\}/);
  assert.match(room, /audioLevelPercent/);
  assert.match(room, /role="meter"/);
});

test('mobile live room keeps autoplay and reconnect recovery controls available', async () => {
  const css = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerV2LiveRoom.css');

  assert.doesNotMatch(
    css,
    /echoo-livekit-listener-copy,\.listener-v2-livekit-host \.echoo-livekit-start-audio,\.listener-v2-livekit-host \.echoo-livekit-retry\s*\{\s*display:\s*none/i
  );
  assert.match(css, /echoo-livekit-start-audio,\.listener-v2-livekit-host \.echoo-livekit-retry\s*\{[^}]*min-height:\s*40px/i);
});

test('listener replay shell exposes detail-page playback contract and metadata-driven seeking', async () => {
  const shell = await source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');
  const detail = await source('../../frontend/src/Components/ListenerAudioDetail/ListenerAudioDetail.jsx');

  assert.match(shell, /const pendingSeekRef\s*=\s*useRef\(null\)/);
  assert.match(shell, /const seekTo\s*=\s*useCallback/);
  assert.match(shell, /const playTrackAt\s*=\s*useCallback/);
  assert.match(shell, /playTrackAt,/);
  assert.match(shell, /seekTo,/);
  assert.match(shell, /currentTime,/);
  assert.match(shell, /duration,/);
  assert.match(shell, /playerError,/);
  assert.match(shell, /onLoadedMetadata=/);
  assert.match(shell, /pendingSeekRef\.current/);
  assert.doesNotMatch(shell, /setTimeout\(\(\)\s*=>\s*seekTo/);

  assert.match(detail, /player\?\.playerError/);
  assert.match(detail, /typeof player\.playTrackAt === 'function'/);
  assert.match(detail, /player\.seekTo\?\./);
});

test('listener recovery distinguishes autoplay policy from transient playback failures', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /const autoplayBlocked = playError\?\.name === 'NotAllowedError'/);
  assert.match(player, /needsAudioStartRef\.current = autoplayBlocked/);
  assert.match(player, /playbackIntentRef\.current !== 'play'/);
  assert.match(player, /!room\.canPlaybackAudio/);
  assert.match(player, /getReceiverStats\(\)/);
  assert.match(player, /watchdog_inbound_rtp_stalled/);
  assert.match(player, /receiverStallStreak/);
  assert.equal(
    (player.match(/if \(publication\.track\?\.kind === Track\.Kind\.Audio\)/g) || []).length,
    1,
    'program publication subscription path should not contain a duplicated nested audio guard'
  );
});

test('creator transport watchdog never treats an intentional pause as a stalled uplink', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');

  assert.match(publisher, /candidate\.paused/);
  assert.match(
    publisher,
    /candidate\.recoveryPromise[\s\S]{0,120}candidate\.paused[\s\S]{0,160}!roomIsConnected/
  );
  assert.match(publisher, /if \(session\) session\.paused = Boolean\(paused\)/);
  assert.match(publisher, /if \(candidate\.paused\) \{\s*await publication\.mute\(\)/);
});

test('backend creator disconnect grace exceeds a normal single reconnect attempt', async () => {
  const webhook = await source('../src/services/livekitWebhookService.js');

  assert.match(webhook, /LIVEKIT_CREATOR_DISCONNECT_GRACE_MS/);
  assert.match(webhook, /\|\| 90000/);
  assert.match(webhook, /Math\.min\(180000/);
});

