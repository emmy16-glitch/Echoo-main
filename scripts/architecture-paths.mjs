export function normalizeRepositoryRelativePath(relativePath) {
  return String(relativePath).replaceAll('\\', '/');
}
