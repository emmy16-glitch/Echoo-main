import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { normalizeCreatorAudioPreferences } from '../src/controllers/settingsController.js';
import User from '../src/models/User.js';
import Broadcast from '../src/models/Broadcast.js';
import TranscriptSegment from '../src/models/TranscriptSegment.js';

const frontendSource = (path) =>
  readFile(new URL(`../../frontend/${path}`, import.meta.url), 'utf8');

test('creator audio preferences are bounded and use explicit raw or enhanced modes', () => {
  assert.deepEqual(normalizeCreatorAudioPreferences({
    audioMode: 'raw',
    noiseReduction: 900,
    echoRemoval: false,
    voiceWarmth: -5,
    voiceClarity: 62.4,
    deEsser: 38.8,
    volumeBalance: '70',
    protectLoudSounds: false,
    masterVolume: 140,
  }), {
    audioMode: 'raw',
    noiseReduction: 100,
    echoRemoval: false,
    voiceWarmth: 0,
    voiceClarity: 62,
    deEsser: 39,
    volumeBalance: 70,
    protectLoudSounds: false,
    masterVolume: 100,
  });
  assert.equal(normalizeCreatorAudioPreferences({ audioMode: 'unknown' }).audioMode, 'enhanced');
});

test('creator accounts receive persistent audio defaults in the backend model', async () => {
  const user = new User({
    username: 'audioengineqa',
    email: 'audio-engine-qa@example.com',
    passwordHash: 'not-used-in-schema-validation',
    displayName: 'Audio Engine QA',
    roles: ['creator'],
    userType: 'creator',
  });

  await user.validate();
  assert.equal(user.preferences.creatorAudio.audioMode, 'enhanced');
  assert.equal(user.preferences.creatorAudio.echoRemoval, true);
  assert.equal(user.preferences.creatorAudio.masterVolume, 100);
  assert.equal(user.preferences.creatorTranscript.language, 'en');
  assert.equal(user.preferences.creatorTranscript.showCaptions, true);
});

test('the studio graph keeps raw bypass, real processing and one post-master destination', async () => {
  const [engine, mixer, publisher, limiter] = await Promise.all([
    frontendSource('src/services/echooAudioProcessingEngine.js'),
    frontendSource('src/services/echooMixerService.js'),
    frontendSource('src/services/livekitPublisher.js'),
    frontendSource('public/echoo-master-limiter-worklet.js'),
  ]);

  assert.match(engine, /inputNode\.connect\(rawGain\)/);
  assert.match(engine, /setSuppressionLevel\(settings\.noiseReduction\)/);
  assert.match(engine, /warmth\.type = 'lowshelf'/);
  assert.match(engine, /deEsser\.type = 'peaking'/);
  assert.match(engine, /createDynamicsCompressor\(\)/);
  assert.match(mixer, /masterGainNode\.connect\(masterDirectGainNode\)/);
  assert.match(mixer, /masterGainNode\.connect\(masterLimiterNode\)/);
  assert.match(mixer, /masterAnalyser\.connect\(destinationNode\)/);
  assert.match(mixer, /export const setMasterMuted/);
  assert.match(mixer, /connectMediaFile/);
  assert.match(mixer, /decodeAudioData/);
  assert.match(mixer, /connectAcquiredStream\('screen'/);
  assert.match(mixer, /\['media', 'screen'\]\.includes\(channelId\)/);
  assert.match(limiter, /registerProcessor\('echoo-master-limiter'/);
  assert.match(publisher, /name: 'echoo-studio-mix'/);
  assert.match(publisher, /startWhisperFlowTranscription\([\s\S]*mediaTrack/);
  assert.match(publisher, /activePublication\.mute\(\)/);
  assert.match(publisher, /activePublication\.unmute\(\)/);
});

test('broadcasts persist privacy-safe source snapshots and authoritative pause state', () => {
  const mediaState = Broadcast.schema.path('mediaState');
  assert.ok(mediaState.enumValues.includes('audio_paused'));
  assert.ok(Broadcast.schema.path('audioSources'));
  assert.ok(Broadcast.schema.path('audioConfiguration.audioMode'));
  assert.equal(Broadcast.schema.path('audioSources.deviceId'), undefined);
});

test('transcript segments are ready for source-aware diarization without inventing a source', () => {
  const sourceType = TranscriptSegment.schema.path('sourceType');
  assert.ok(sourceType.enumValues.includes('final_mix'));
  assert.ok(sourceType.enumValues.includes('screen_share'));
  assert.equal(sourceType.defaultValue, 'final_mix');
});
