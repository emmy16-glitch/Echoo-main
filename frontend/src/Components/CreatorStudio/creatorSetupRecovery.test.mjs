import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('Individual and Organization setup provision the canonical Channel before completion', async () => {
  const source = await read('../CreatorSetup/CreatorSetup.jsx');
  const individualStart = source.indexOf('const finishIndividualSetup');
  const organizationStart = source.indexOf('const finishOrganizationSetup');
  const individual = source.slice(individualStart, organizationStart);
  const organization = source.slice(organizationStart, source.indexOf('const handleContinue', organizationStart));

  assert.ok(individual.indexOf('await ensureCanonicalStation') < individual.indexOf('await onboardingService.complete'));
  assert.ok(organization.indexOf('await ensureCanonicalStation') < organization.indexOf('await onboardingService.complete'));
});

test('creator setup treats an already-created Channel as a recoverable retry', async () => {
  const setup = await read('../CreatorSetup/CreatorSetup.jsx');
  const api = await read('../../services/api.js');
  const auth = await read('../../../../backend/src/controllers/authController.js');

  assert.match(setup, /error\?\.code !== "CHANNEL_ALREADY_EXISTS"/);
  assert.match(setup, /const retry = await batch2Service\.getMyStations\(\)/);
  assert.match(api, /'CHANNEL_ALREADY_EXISTS'/);
  assert.match(auth, /code: 'EMAIL_EXISTS'/);
  assert.match(auth, /code: 'USERNAME_TAKEN'/);
});

test('the Broadcast empty state clearly directs a creator without a Channel to setup', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');
  const styles = await read('./CreatorBroadcastApproved.css');

  assert.match(workspace, /Your Channel is your public home on Echoo\./);
  assert.match(workspace, /Set up Channel/);
  assert.doesNotMatch(workspace, /One Channel, one public home/);
  assert.match(workspace, /onNavigate\?\.\('Station'\)/);
  assert.match(styles, /\.ec2-no-channel \{/);
  assert.match(styles, /\.ec2-no-channel button:focus-visible/);
});

test('the Broadcast gate fetches the authenticated creator Channel from the API', async () => {
  const workspace = await read('./CreatorLiveConnectedWorkspace.jsx');

  assert.match(workspace, /batch2Service\.getMyStations\(\)/);
  assert.match(workspace, /if \(!stations\.length && !currentLiveBroadcast\)/);
});
