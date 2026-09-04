import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessExperience,
  hasCompletedCreatorProfile,
  hasCreatorCapability,
  hasListenerProfile,
} from './accountExperience.js';

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

test('shared onboarding completion without creatorType is still incomplete Creator setup', () => {
  const partial = {
    ...listener,
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorType: '',
  };

  assert.equal(hasCompletedCreatorProfile(partial), false);
  assert.equal(canAccessExperience(partial, 'creator'), false);
});

test('Creator Studio opens only after capability, onboarding and creatorType are complete', () => {
  const ready = {
    ...listener,
    userType: 'creator',
    roles: ['listener', 'creator'],
    onboardingCompleted: true,
    creatorType: 'individual',
  };

  assert.equal(hasCompletedCreatorProfile(ready), true);
  assert.equal(canAccessExperience(ready, 'creator'), true);
  assert.equal(canAccessExperience(ready, 'listener'), true);
});
