export const PRIVACY_POLICY_VERSION = '2026-10-06';

export const validatePrivacyPolicyAcceptance = (acceptance) => (
  acceptance?.accepted === true &&
  acceptance?.version === PRIVACY_POLICY_VERSION
);
