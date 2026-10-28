// OPFS recovery must not stop at an evicted or empty newest take. Preserve
// original registry order (newest first), creator isolation and all metadata.
export const recoveryCandidatesForUser = (manifests, userId) => {
  const list = Array.isArray(manifests) ? manifests : [];
  const user = String(userId || '');
  const legacy = list.filter((item) => item && !item.ownerUserId);
  if (!user) return legacy;
  const owned = list.filter((item) => item && String(item.ownerUserId || '') === user);
  // Untagged legacy takes require the existing backend ownership check.
  return [...owned, ...legacy];
};

export const firstAvailableRecoveryManifest = async (candidates, canRead) => {
  for (const manifest of candidates || []) {
    try {
      if (await canRead(manifest)) return manifest;
    } catch {
      // An evicted/unavailable file must not hide older intact recordings.
      // Do not delete the manifest or the surviving OPFS files.
    }
  }
  return null;
};
