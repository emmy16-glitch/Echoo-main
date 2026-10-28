import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('deployment validates backend Node version and actual production config before rebuilding or restart', async () => {
  const script = await read('deploy/deploy-echoo.sh');
  const nodeCheck = script.indexOf('node_at_least "$NODE20_BIN/node" "20.19.0"');
  const envImport = script.indexOf("import('./src/config/env.js')");
  const frontendBuild = script.indexOf('cd "$APP_DIR/frontend"');
  const restart = script.indexOf('sudo systemctl restart echoo-api.service');
  assert(nodeCheck >= 0, 'required backend version must be checked');
  assert(envImport >= 0, 'the real backend env parser must be evaluated before deployment');
  assert(nodeCheck < frontendBuild);
  assert(envImport < frontendBuild);
  assert(frontendBuild < restart);
});

test('Digi02 example has disabled private Whisper configuration and safe permanent recording settings', async () => {
  const example = await read('deploy/echoo.production.env.example');
  assert.match(example, /^TRANSCRIPTION_ENABLED=false$/m);
  assert.match(example, /^WHISPER_FLOW_URL=ws:\/\/127\.0\.0\.1:8181\/ws$/m);
  assert.match(example, /^LIVEKIT_SERVER_RECORDING_ENABLED=true$/m);
  assert.match(example, /^SERVER_RECORDING_SEGMENTS_ENABLED=true$/m);
  assert.match(example, /^REPLAY_ARCHIVE_DIR=\/mnt\/storage\/media\/echoo\/replay$/m);
});
