import assert from 'node:assert/strict';
import test from 'node:test';

import User from '../src/models/User.js';
import {
  hasCompletedCreatorSetup,
  hasCompletedProfileSetup,
  hasCreatorCapability,
  hasListenerCapability,
} from '../src/utils/accountCapabilities.js';

test('every authenticated Echoo user remains listener-capable', () => {
  const listener = { _id: 'listener-a', roles: ['listener'], userType: 'listener' };
  const creator = { _id: 'creator-a', roles: ['listener', 'creator'], userType: 'creator' };

  assert.equal(hasListenerCapability(listener), true);
  assert.equal(hasListenerCapability(creator), true);
  assert.equal(hasCreatorCapability(listener), false);
  assert.equal(hasCreatorCapability(creator), true);
});

test('shared profile completion is independent from creator onboarding', () => {
  const upgradingUser = {
    _id: 'account-a',
    roles: ['listener', 'creator'],
    userType: 'creator',
    profileCompleted: true,
    onboardingCompleted: true,
    creatorOnboardingCompleted: false,
    creatorProfile: { creatorType: 'individual' },
  };

  assert.equal(hasCompletedProfileSetup(upgradingUser), true);
  assert.equal(hasCompletedCreatorSetup(upgradingUser), false);
});

test('legacy creator accounts remain valid without a destructive migration', () => {
  const legacyCreator = {
    _id: 'legacy-creator',
    roles: ['creator'],
    userType: 'creator',
    onboardingCompleted: true,
    creatorProfile: { creatorType: 'individual' },
  };

  assert.equal(hasCompletedProfileSetup(legacyCreator), true);
  assert.equal(hasCompletedCreatorSetup(legacyCreator), true);
});

test('serialized account data exposes capabilities while preserving one identity', () => {
  const user = new User({
    username: 'oneaccount',
    email: 'one@example.com',
    passwordHash: 'not-used-in-this-test',
    displayName: 'One Account',
    roles: ['listener', 'creator'],
    userType: 'creator',
    onboardingCompleted: true,
    profileCompleted: true,
    creatorOnboardingCompleted: false,
    creatorProfile: { creatorType: 'individual' },
  });

  const serialized = user.toJSON();

  assert.equal(serialized.capabilities.listener, true);
  assert.equal(serialized.capabilities.creator, true);
  assert.equal(serialized.profileCompleted, true);
  assert.equal(serialized.creatorOnboardingCompleted, false);
  assert.ok(serialized.roles.includes('listener'));
  assert.ok(serialized.roles.includes('creator'));
});
