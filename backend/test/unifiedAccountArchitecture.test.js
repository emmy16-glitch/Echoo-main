import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import User from '../src/models/User.js';
import {
  accountCapabilities,
  hasCompletedCreatorSetup,
  hasCreatorCapability,
} from '../src/utils/accountCapabilities.js';

const source = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('every Echoo account is Listener-capable and Creator remains optional', () => {
  const listener = {
    id: 'listener-1',
    userType: 'listener',
    roles: ['listener'],
    onboardingCompleted: true,
  };

  assert.deepEqual(accountCapabilities(listener), {
    listener: true,
    creator: false,
  });
  assert.equal(hasCreatorCapability(listener), false);
  assert.equal(hasCompletedCreatorSetup(listener), false);
});

test('Creator activation and Channel setup are independent states', () => {
  const activated = {
    id: 'same-user',
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorProfile: {
      setupCompleted: false,
    },
  };

  assert.equal(hasCreatorCapability(activated), true);
  assert.equal(hasCompletedCreatorSetup(activated), false);
  assert.equal(activated.onboardingCompleted, true);

  const completed = {
    ...activated,
    creatorProfile: {
      setupCompleted: true,
      creatorType: 'individual',
      category: 'Technology',
    },
  };

  assert.equal(hasCompletedCreatorSetup(completed), true);
  assert.equal(completed.onboardingCompleted, true);
});

test('creator setup completion is persisted separately from moderation approval', () => {
  assert.ok(User.schema.path('creatorProfile.setupCompleted'));
  assert.ok(User.schema.path('creatorProfile.isApproved'));
  assert.equal(User.schema.path('creatorProfile.setupCompleted').defaultValue, undefined);
});

test('legacy completed creators remain migration-compatible', () => {
  assert.equal(hasCompletedCreatorSetup({
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorProfile: {
      creatorType: 'individual',
      category: 'Music',
      isApproved: true,
    },
  }), true);

  assert.equal(hasCompletedCreatorSetup({
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    onboardingStep: 5,
    creatorProfile: {
      creatorType: 'individual',
      category: 'Podcast',
    },
  }), true);
});

test('partial legacy Creator records are sent back to Channel setup', () => {
  assert.equal(hasCompletedCreatorSetup({
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorProfile: {
      creatorType: 'individual',
      isApproved: true,
    },
  }), false);

  assert.equal(hasCompletedCreatorSetup({
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorProfile: {
      category: 'Technology',
    },
  }), false);
});

test('Creator activation never reopens shared Account/Profile onboarding', async () => {
  const onboardingController = await source('../src/controllers/onboardingController.js');

  assert.doesNotMatch(onboardingController, /onboardingCompleted\s*=\s*false/);
  assert.match(onboardingController, /creatorProfile\.setupCompleted\s*=\s*false/);
  assert.match(onboardingController, /creatorProfile\.setupCompleted\s*=\s*true/);
  assert.doesNotMatch(onboardingController, /creatorProfile\.isApproved\s*=\s*true/);
});
