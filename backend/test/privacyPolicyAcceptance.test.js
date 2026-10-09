import test from 'node:test';
import assert from 'node:assert/strict';

import User from '../src/models/User.js';
import { register } from '../src/controllers/authController.js';
import {
  PRIVACY_POLICY_VERSION,
  validatePrivacyPolicyAcceptance,
} from '../src/config/privacyPolicy.js';

test('registration policy contract rejects missing, unchecked, and stale acceptance', () => {
  assert.equal(validatePrivacyPolicyAcceptance(undefined), false);
  assert.equal(validatePrivacyPolicyAcceptance({ accepted: false, version: PRIVACY_POLICY_VERSION }), false);
  assert.equal(validatePrivacyPolicyAcceptance({ accepted: true, version: 'older-policy' }), false);
});

test('registration policy contract accepts the published policy version', () => {
  assert.equal(
    validatePrivacyPolicyAcceptance({ accepted: true, version: PRIVACY_POLICY_VERSION }),
    true
  );
});

test('registration controller rejects a missing policy acknowledgment before database access', async () => {
  const req = {
    body: {
      username: 'policy-user',
      email: 'policy@example.test',
      password: 'Strong-password-1',
      displayName: 'Policy User',
    },
  };
  let statusCode;
  let responseBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  await register(req, res, assert.fail);

  assert.equal(statusCode, 400);
  assert.equal(responseBody?.error?.code, 'PRIVACY_POLICY_ACCEPTANCE_REQUIRED');
  assert.equal(responseBody?.error?.policyVersion, PRIVACY_POLICY_VERSION);
});

test('policy acknowledgment is durable but excluded from serialized account data', async () => {
  const acceptedAt = new Date('2026-10-09T07:00:00.000Z');
  const user = new User({
    username: 'policy-user',
    email: 'policy@example.test',
    passwordHash: 'stored-hash',
    displayName: 'Policy User',
    privacyPolicyAcceptance: { version: PRIVACY_POLICY_VERSION, acceptedAt },
  });

  await user.validate();
  assert.equal(user.privacyPolicyAcceptance.version, PRIVACY_POLICY_VERSION);
  assert.equal(user.privacyPolicyAcceptance.acceptedAt.toISOString(), acceptedAt.toISOString());
  assert.equal(user.toJSON().privacyPolicyAcceptance, undefined);
});

test('existing accounts remain valid without retroactive policy acknowledgment', async () => {
  const existingUser = new User({
    username: 'existing-user',
    email: 'existing@example.test',
    passwordHash: 'stored-hash',
    displayName: 'Existing User',
  });

  await existingUser.validate();
  assert.equal(existingUser.privacyPolicyAcceptance.version, null);
  assert.equal(existingUser.privacyPolicyAcceptance.acceptedAt, null);
});
