import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('live listener keeps playback intent, device volume, and explicit recovery actions', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /playbackIntentRef\s*=\s*useRef\('play'\)/);
  assert.match(player, /volumeRef\s*=\s*useRef\(readListenerVolume\(\)\)/);
  assert.match(player, /mutedRef\s*=\s*useRef\(readListenerVolume\(\) === 0\)/);
  assert.match(player, /element\.volume\s*=\s*volumeRef\.current/);
  assert.match(player, /element\.muted\s*=\s*mutedRef\.current/);
  assert.match(player, /lastAudibleVolumeRef\s*=\s*useRef/);
  assert.match(player, /!nextMuted && volumeRef\.current <= 0/);
  assert.match(player, /saveListenerVolume\(restoredVolume\)/);
  assert.match(player, /onReconnect:\s*\(\)\s*=>\s*setRetryVersion/);
  assert.match(player, /const onOnline[\s\S]*roomLinkRef\.current === 'reconnecting'[\s\S]*browser_online_missing_transport/);
  assert.match(player, /getReceiverStats/);
  assert.match(player, /scheduleHardReconnect\('inbound_rtp_stall'\)/);
  assert.match(player, /RoomEvent\.TrackStreamStateChanged/);
  assert.match(player, /RoomEvent\.ConnectionQualityChanged/);
  assert.match(player, /isPlaying,/);
  assert.match(player, /playbackState:/);

  assert.match(player, /setActionHandler\('play',\s*\(\)\s*=>\s*\{\s*void playAudio\(\)/);
  assert.match(player, /setActionHandler\('pause',\s*pauseAudio\)/);
  assert.match(player, /setActionHandler\('stop',\s*stopAudio\)/);
  assert.doesNotMatch(player, /setActionHandler\('pause',[\s\S]{0,80}togglePlayback/);
});

test('listener secondary routes inherit a truthful primary navigation parent', async () => {
  const listener = await source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');

  assert.match(listener, /'\/listen\/notifications'[^\n]*return 'profile'/);
  assert.match(listener, /startsWith\('\/listen\/audio\/'\)/);
  assert.match(listener, /startsWith\('\/listen\/collections\/'\)/);
  assert.match(listener, /startsWith\('\/listen\/creator\/'\)/);
});

test('player state defaults to unity unless the listener explicitly lowers volume', async () => {
  const controller = await source('../src/controllers/playerController.js');
  const userModel = await source('../src/models/User.js');

  assert.match(userModel, /volume:\s*\{\s*type:\s*Number,\s*min:\s*0,\s*max:\s*1,\s*default:\s*1\s*\}/);
  assert.match(controller, /volume:\s*user\.preferences\?\.player\?\.volume\s*\?\?\s*1/);
  assert.doesNotMatch(controller, /volume:\s*user\.preferences\?\.player\?\.volume\s*\?\?\s*0\.8/);
});

test('guest live catalog opens broadcasts directly instead of passing station ids to the live room', async () => {
  const listener = await source('../../frontend/src/Components/ListenerV2/ListenerV2.jsx');

  assert.match(listener, /batch2Service\.listBroadcasts\(\{[\s\S]*status:\s*'live'/);
  assert.match(listener, /navigate\(\`\/listen\/live\/\$\{idOf\(item\)\}\`/);
  assert.doesNotMatch(
    listener,
    /const response = await batch2Service\.listStations\(\{ page: 1, limit: 100 \}\);[\s\S]{0,220}setLiveNow\(stations\.filter/
  );
});

test('live room route changes cannot leak stale room state into the next broadcast', async () => {
  const room = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');

  assert.match(room, /roomLoadGenerationRef\s*=\s*useRef\(0\)/);
  assert.match(room, /chatLoadGenerationRef\s*=\s*useRef\(0\)/);
  assert.match(room, /setMessages\(\[\]\)/);
  assert.match(room, /setFollowing\(false\)/);
  assert.match(room, /setLiked\(false\)/);
  assert.match(room, /sameId\(current\?\.id, broadcastId\)/);
  assert.match(room, /sameId\(current\?\.id, show\.id\)/);
  assert.doesNotMatch(room, /listenerCount:\s*Number\(payload\?\.listenerCount\)\s*\|\|\s*0/);
});

test('live chat rejoin is acknowledged, backfills missed messages, and uses dedicated guest controls', async () => {
  const [room, roomCss, components, componentCss] = await Promise.all([
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx'),
    source('../../frontend/src/Components/ListenerLiveExperience/ListenerV2LiveRoom.css'),
    source('../../frontend/src/Components/ListenerExperience/ListenerExperienceComponents.jsx'),
    source('../../frontend/src/Components/ListenerExperience/ListenerExperienceComponents.css'),
  ]);

  assert.match(room, /connectedSocket\.emit\('broadcast:join',[\s\S]{0,220}\(response\) =>/);
  assert.match(room, /if \(!response\?\.ok\)[\s\S]{0,140}fallback\(\)/);
  assert.match(room, /loadChat\(\{ silent: true \}\)/);
  assert.match(room, /chatOpenRef\.current/);
  assert.match(room, /className="listener-v2-room-chat-signin"/);
  assert.doesNotMatch(room, /Sign in to chat and follow[\s\S]{0,40}listener-v2-room-back/);
  assert.match(roomCss, /listener-v2-room-chat-signin/);
  assert.match(roomCss, /grid-template-rows:\s*auto minmax\(0,1fr\)/);
  assert.match(components, /className="lex-chat-new-messages"/);
  assert.match(components, /<FiHeart aria-hidden="true" \/>/);
  assert.match(components, /onReact\s*&&\s*<button/);
  assert.doesNotMatch(components, /message\.reaction\s*&&\s*<button/);
  assert.match(componentCss, /overflow-wrap:\s*anywhere/);
  assert.match(componentCss, /\.lex-chat-message > div \{ min-width:\s*0/);
});

test('live room never fabricates listener counts or follow success when identity data is missing', async () => {
  const room = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealLiveRoom.jsx');

  assert.match(room, /rawCount == null \|\| rawCount === ''/);
  assert.match(room, /Number\.isFinite\(count\) \? Math\.max\(0, count\) : null/);
  assert.match(room, /presence\.listenerCount == null \|\| presence\.listenerCount === ''[\s\S]{0,180}current\.listenerCount/);
  assert.match(room, /\{show\.listenerCount != null && <span>/);
  assert.match(room, /\{show\.stationId && \(/);
  assert.match(room, /Follow is unavailable for this broadcast/);
});

test('Channel profile never invents zero listeners when count is unavailable', async () => {
  const profile = await source('../../frontend/src/Components/ListenerLiveExperience/ListenerRealStationProfile.jsx');

  assert.match(profile, /const honestCount =/);
  assert.match(profile, /stationListenerCount != null/);
  assert.match(profile, /liveListenerCount != null/);
  assert.doesNotMatch(profile, /Number\(station\.listenerCount\)\s*\|\|\s*0/);
  assert.doesNotMatch(profile, /Number\(live\.listenerCount\)\s*\|\|\s*0/);
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

test('listener late-join subscription and non-autoplay failures remain recoverable', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.equal(
    (player.match(/if \(publication\.track\?\.kind === Track\.Kind\.Audio\)/g) || []).length,
    1,
    'late-join publication handling must not contain a duplicated nested audio-track guard'
  );
  assert.match(player, /publication\.setSubscribed\(true\)/);
  assert.match(player, /scheduleHardReconnect\('existing_element_play_failed'\)/);
  assert.match(player, /scheduleHardReconnect\('new_element_play_failed'\)/);
  assert.match(player, /scheduleHardReconnect\('program_element_ended'\)/);
  assert.match(player, /const blocked = playError\?\.name === 'NotAllowedError'/);
  assert.match(
    player,
    /if \(needsAudioStart \|\| !elements\.length\) return startAudio\(\)/,
    'a guest Play tap before track attachment must unlock LiveKit audio instead of becoming a no-op'
  );
  assert.match(player, /await room\.startAudio\(\)/);
  assert.match(player, /setStatus\(elements\.length \? 'listening' : 'recovering_audio'\)/);
});

test('creator publisher does not treat an intentional pause as a transport stall', async () => {
  const publisher = await source('../../frontend/src/services/livekitPublisher.js');

  assert.match(publisher, /candidate\.paused/);
  assert.match(publisher, /if \(session\) session\.paused = Boolean\(paused\)/);
  assert.match(publisher, /candidate\.recoveryPromise \|\|\s*candidate\.paused/s);
  assert.match(publisher, /if \(candidate\.paused\) await publication\.mute\(\)/);
  assert.match(publisher, /session\.lastProgressAt = Date\.now\(\)/);
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


test('listener reconnect only marks autoplay blocked when LiveKit actually cannot play audio', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /const playbackBlocked =[\s\S]*!room\.canPlaybackAudio/);
  assert.match(player, /setNeedsAudioStart\(playbackBlocked\)/);
  assert.match(player, /needsAudioStartRef\.current = playbackBlocked/);
  assert.doesNotMatch(player, /needsAudioStartRef\.current = attachedRef\.current\.size > 0 && !hasPlayingAudio/);
});


test('listener watchdog and reattachment never override an intentional pause', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /playbackIntentRef\.current === 'pause' && entries\.some\(currentAttachmentIsHealthy\)/);
  assert.match(player, /if \(playbackIntentRef\.current === 'pause'\) \{[\s\S]{0,220}setStatus\('connected'\)/);
  assert.match(player, /playbackIntentRef\.current === 'play'[\s\S]{0,220}!entries\.some\(\(entry\) => mediaElementIsPlaying\(entry\.element\)\)/);
  assert.match(player, /const playbackBlocked =[\s\S]{0,180}playbackIntentRef\.current === 'play'/);
});

test('persistent live play action restarts a disconnected room instead of only calling startAudio', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /status === 'error' \|\| status === 'failed' \|\| status === 'disconnected'[\s\S]{0,180}setRetryVersion/);
  assert.match(player, /canReconnect: status === 'error' \|\| status === 'failed' \|\| status === 'disconnected'/);
  assert.match(player, /playbackIntentRef\.current = 'play'/);
});

test('listener reconnect supervisor never waits forever in LiveKit reconnecting', async () => {
  const player = await source('../../frontend/src/Components/ListenerLiveExperience/LiveKitListenerPlayer.jsx');

  assert.match(player, /DefaultReconnectPolicy/);
  assert.match(player, /LIVEKIT_RECONNECT_DELAYS_MS/);
  assert.match(player, /RoomEvent\.SignalReconnecting/);
  assert.match(player, /RoomEvent\.Reconnecting[\s\S]{0,500}armReconnectDeadline\(room\)/);
  assert.match(player, /LISTENER_HARD_RECONNECT_DEADLINE_MS/);
  assert.match(player, /LISTENER_HARD_RECONNECT_JITTER_MS/);
  assert.match(player, /scheduleHardReconnect\('reconnect_deadline_exceeded'\)/);
  assert.match(player, /clearReconnectDeadline\(\)/);
  assert.match(player, /roomCanCarryMedia\(room\)/);
});
