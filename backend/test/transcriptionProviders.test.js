import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { normalizeBroadcastVocabulary } from '../src/services/transcription/BroadcastVocabulary.js';
import { validateTranscriptCandidate } from '../src/services/transcription/transcriptValidation.js';
import { normalizeTranscriptSegmentInput } from '../src/services/transcriptPersistenceService.js';

const source = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('broadcast vocabulary is trimmed, case-deduplicated and bounded', () => {
  const terms = normalizeBroadcastVocabulary(
    [' Echoo Live ', 'NATI', 'echoo live', '', 'Pastor Chinedu'],
    Array.from({ length: 150 }, (_, index) => `Term ${index}`)
  );
  assert.equal(terms[0], 'Echoo Live');
  assert.equal(terms[1], 'NATI');
  assert.equal(terms[2], 'Pastor Chinedu');
  assert.equal(terms.length, 100);
});

test('quality gate rejects empty/extreme candidates and preserves normal corrections', () => {
  assert.deepEqual(
    validateTranscriptCandidate({ originalText: 'The creator is speaking clearly', candidateText: '' }),
    { accepted: false, reason: 'empty_candidate' }
  );
  assert.equal(
    validateTranscriptCandidate({ originalText: 'one two three four five', candidateText: 'one' }).accepted,
    false
  );
  assert.equal(
    validateTranscriptCandidate({
      originalText: 'Welcome to Echoo live from Lagos today',
      candidateText: 'Welcome to Echoo, live from Lagos today.',
    }).accepted,
    true
  );
});

test('canonical segment input allowlists live providers', () => {
  const base = {
    providerSegmentId: 'seg-1',
    sequence: 1,
    text: 'hello',
    startMs: 0,
    endMs: 1000,
    isFinal: true,
  };
  assert.equal(normalizeTranscriptSegmentInput({ ...base, provider: 'parakeet' }).provider, 'parakeet');
  assert.equal(normalizeTranscriptSegmentInput({ ...base, provider: 'gemini-live' }).provider, 'gemini-live');
  assert.throws(
    () => normalizeTranscriptSegmentInput({ ...base, provider: 'malicious-provider' }),
    (error) => error?.code === 'INVALID_PROVIDER'
  );
});

test('Gemini token endpoint is authenticated and never exposes the permanent key', async () => {
  const routes = await source('src/routes/transcriptRoutes.js');
  const controller = await source('src/controllers/transcriptionProviderController.js');
  const service = await source('src/services/transcription/geminiService.js');
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.match(routes, /gemini-live-token/);
  assert.match(controller, /Only the broadcast creator can manage live transcription/);
  assert.match(service, /authTokens\.create/);
  assert.match(service, /uses:\s*1/);
  assert.match(service, /liveConnectConstraints/);
  assert.doesNotMatch(controller, /geminiApiKey/);
});

test('Gemini quality uses Interactions API and keeps original text behind validation', async () => {
  const service = await source('src/services/transcription/geminiService.js');
  const quality = await source('src/services/transcriptQualityService.js');
  assert.match(service, /interactions\.create/);
  assert.match(service, /transcription_config/);
  assert.match(service, /originalText/);
  assert.match(service, /validateTranscriptCandidate/);
  assert.match(quality, /preserveRaw/);
  assert.match(quality, /falling back to Whisper quality/);
});

test('transcript persistence binds browser provider identity to its server session', async () => {
  const persistence = await source('src/services/transcriptPersistenceService.js');
  assert.match(persistence, /session\.provider !== normalized\.provider/);
  assert.match(persistence, /PROVIDER_MISMATCH/);
  assert.match(persistence, /SESSION_CLOSED/);
});
