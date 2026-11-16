let revision = 0;
const listeners = new Set<() => void>();
export const getSessionRevision = () => revision;
export function sessionChanged() {
  revision += 1;
  listeners.forEach((listener) => listener());
}
export function subscribeSessionChanges(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function createLatestRequestGuard() {
  let generation = 0;
  return {
    begin() {
      const request = ++generation;
      const session = getSessionRevision();
      return () => request === generation && session === getSessionRevision();
    },
    invalidate() { generation += 1; },
  };
}
