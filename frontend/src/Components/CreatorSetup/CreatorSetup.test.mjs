import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

// Channel Setup rebuild contract: real Echoo flow, honest states, the
// reference hierarchy (header -> intro -> Channel details card), and the
// duplicate-safe submit sequence.

test('Channel Setup renders the reference hierarchy without fake completion states', async () => {
  const source = await read('./CreatorSetup.jsx');
  const styles = await read('./CreatorSetup.css');

  assert.match(source, /Create your Channel/);
  assert.match(source, /Channel details/);
  assert.match(source, /This is how your Channel will appear to listeners\./);
  // Single dominant purpose: no competing hero headings.
  assert.doesNotMatch(source, /Creator space/);
  assert.doesNotMatch(source, /CHANNEL SETUP/);
  // Fake completed-state checklist is gone (honest numbered promises only).
  assert.doesNotMatch(source, /Choose a name and category/);
  assert.doesNotMatch(source, /Start broadcasting/);
  assert.doesNotMatch(source, /FaCheck/);
  assert.match(source, /Artwork is optional/);
  // Real brand mark shared with the auth screens, never a CSS redraw.
  assert.match(source, /echoo-logo-mark\.png/);
  assert.doesNotMatch(source, /echoo-role-headphones-microphone/);
  // Consequence-based primary action.
  assert.match(source, /Create Channel/);
  assert.doesNotMatch(source, /Set up Channel/);
  // Layout hooks exist for desktop / tablet / mobile.
  assert.match(styles, /\.channel-setup-layout/);
  assert.match(styles, /@media \(max-width: 920px\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
});

test('identity selector is an honest, accessible control', async () => {
  const source = await read('./CreatorSetup.jsx');

  assert.match(source, /aria-pressed=\{creatorType === 'individual'\}/);
  assert.match(source, /aria-pressed=\{creatorType === 'organization'\}/);
  assert.match(source, /<fieldset/);
  assert.match(source, /<legend/);
  assert.match(source, /Create as yourself/);
  assert.match(source, /Brand, church or community/);
  // Organization fields appear conditionally without layout jumps.
  assert.match(source, /isOrganization &&/);
  assert.match(source, /channel-setup-org-reveal/);
});

test('artwork stays optional with preview, formats, and size guidance', async () => {
  const source = await read('./CreatorSetup.jsx');

  assert.match(source, /Channel artwork/);
  assert.match(source, /Optional/);
  assert.match(source, /Choose artwork/);
  assert.match(source, /Change artwork/);
  assert.match(source, /JPG, PNG or WebP/);
  assert.match(source, /max 10 MB/);
  assert.match(source, /alt="Channel artwork preview"/);
  assert.match(source, /Remove artwork/);
  assert.match(source, /300<\/span>|{DESCRIPTION_MAX}/);
});

test('validation is inline, field-associated, and preserves entered values', async () => {
  const source = await read('./CreatorSetup.jsx');

  assert.match(source, /aria-invalid=\{Boolean\(fieldErrors\.channelName\)\}/);
  assert.match(source, /aria-invalid=\{Boolean\(fieldErrors\.category\)\}/);
  assert.match(source, /aria-invalid=\{Boolean\(fieldErrors\.description\)\}/);
  assert.match(source, /role="alert"/);
  // Failures never clear valid fields: no state resets on error paths.
  assert.doesNotMatch(source, /setChannelName\(''\)/);
  assert.doesNotMatch(source, /setDescription\(''\)/);
  assert.doesNotMatch(source, /setCategory\(''\)/);
});

test('submit is duplicate-safe and surfaces a taken name on the field', async () => {
  const source = await read('./CreatorSetup.jsx');
  const submitStart = source.indexOf('const submit = async');
  const submit = source.slice(submitStart, source.indexOf('return (', submitStart));

  assert.match(submit, /if \(saving\) return;/);
  assert.match(submit, /await onboardingService\.activateCreator/);
  assert.match(submit, /await onboardingService\.chooseCreatorType/);
  assert.match(submit, /await onboardingService\.updateContentInfo/);
  assert.match(submit, /await ensureCanonicalChannel/);
  assert.match(submit, /await onboardingService\.complete/);
  // Taken slug explains itself on the name field (backend 409
  // STATION_NAME_TAKEN is user-safe); retry cannot duplicate the Channel.
  assert.match(submit, /error\?\.code === 'STATION_NAME_TAKEN'/);
  assert.match(submit, /already taken/);
  assert.match(submit, /nameInputRef\.current\?\.focus/);
  assert.match(submit, /window\.location\.assign\('\/creator-studio'\)/);
});

test('loading state disables duplicate submission with honest copy', async () => {
  const source = await read('./CreatorSetup.jsx');

  assert.match(source, /loading=\{saving\}/);
  assert.match(source, /loadingText="Creating Channel…"/);
  assert.match(source, /disabled=\{saving\}/);
});
