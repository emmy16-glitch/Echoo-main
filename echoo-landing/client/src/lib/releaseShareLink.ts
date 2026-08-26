/** Builds the canonical public page URL for sharing the current Echoo release. */
export function buildReleaseShareLink(origin: string, version = "v1.0.5") {
  const releaseUrl = new URL("/release", origin);
  releaseUrl.hash = "downloads";
  releaseUrl.searchParams.set("release", version);
  return releaseUrl.toString();
}
