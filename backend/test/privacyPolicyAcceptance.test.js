import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  registrationPrivacyAcknowledgement,
} from '../src/config/privacyPolicy.js';

test('explicit current-policy agreement creates an attributable acceptance record', () => {
  const result = registrationPrivacyAcknowledgement({
    privacyPolicyAccepted: true,
    privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
  });
  assert.equal(result.valid, true);
  assert.equal(result.legacyClient, false);
  assert.equal(result.record.version, '2026-10-06');
  assert.ok(result.record.acceptedAt instanceof Date);
});

test('unchecked, missing-version, and stale agreements are rejected', () => {
  for (const request of [
    { privacyPolicyAccepted: false, privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION },
    { privacyPolicyAccepted: true },
    { privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION },
    { privacyPolicyAccepted: true, privacyPolicyVersion: '2025-01-01' },
  ]) {
    const result = registrationPrivacyAcknowledgement(request);
    assert.equal(result.valid, false);
    assert.equal(result.record, null);
    assert.equal(result.legacyClient, false);
  }
});

test('legacy clients remain compatible but never receive fictitious consent records', () => {
  const result = registrationPrivacyAcknowledgement({ username: 'old-version-listener' });
  assert.deepEqual(result, { valid: true, legacyClient: true, record: null });
});
