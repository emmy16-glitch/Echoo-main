// Canonical version of the Privacy Policy published on October 6, 2026.
// Keep this in sync with the visible /privacy-policy document when revised.
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-10-06';

// Older mobile clients may not yet send acknowledgment fields. Preserve their
// existing registration contract during rollout, but reject partial, false,
// or stale acknowledgments rather than recording an agreement that wasn't made.
export function registrationPrivacyAcknowledgement(body = {}) {
  const provided = Object.prototype.hasOwnProperty.call(body, 'privacyPolicyAccepted') ||
    Object.prototype.hasOwnProperty.call(body, 'privacyPolicyVersion');
  if (!provided) return { valid: true, legacyClient: true, record: null };
  const valid = body.privacyPolicyAccepted === true &&
    body.privacyPolicyVersion === CURRENT_PRIVACY_POLICY_VERSION;
  return {
    valid,
    legacyClient: false,
    record: valid ? {
      version: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedAt: new Date(),
    } : null,
  };
}
