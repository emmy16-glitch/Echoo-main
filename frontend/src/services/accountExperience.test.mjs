import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessExperience,
  hasCompletedCreatorProfile,
  hasCreatorCapability,
  hasListenerProfile,
} from './accountCapabilities.js';

const listener = {
  id: 'user-1',
  email: 'creator@example.com',
  userType: 'listener',
  roles: ['listener'],
  onboardingCompleted: true,
};

test('every authenticated Echoo identity keeps Listener access', () => {
  assert.equal(hasListenerProfile(listener), true);
  assert.equal(canAccessExperience(listener, 'listener'), true);
});

test('creator capability alone does not expose Creator Studio', () => {
  const activated = {
    ...listener,
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: false,
  };

  assert.equal(hasCreatorCapability(activated), true);
  assert.equal(hasCompletedCreatorProfile(activated), false);
  assert.equal(canAccessExperience(activated, 'creator'), false);
});

test('shared onboarding completion without creatorProfile.creatorType is still incomplete Creator setup', () => {
  const partial = {
    ...listener,
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorProfile: {},
  };

  assert.equal(hasCompletedCreatorProfile(partial), false);
  assert.equal(canAccessExperience(partial, 'creator'), false);
});

test('Creator Studio opens after backend creatorProfile, onboarding and capability are complete', () => {
  const ready = {
    ...listener,
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorProfile: { creatorType: 'individual' },
  };

  assert.equal(hasCompletedCreatorProfile(ready), true);
  assert.equal(canAccessExperience(ready, 'creator'), true);
  assert.equal(canAccessExperience(ready, 'listener'), true);
});

test('legacy flattened creatorType remains accepted during migration', () => {
  const readyLegacy = {
    ...listener,
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorType: 'organization',
  };

  assert.equal(hasCompletedCreatorProfile(readyLegacy), true);
});
