export const DEFAULT_CHANGELOG_ITEM = "listener-controls";

export function resolveChangelogSelection(nextValue: string, validValues: readonly string[]) {
  return validValues.includes(nextValue) ? nextValue : "";
}
