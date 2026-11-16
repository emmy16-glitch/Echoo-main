import { useEffect, useRef } from 'react';
import { createLatestRequestGuard } from '@/src/services/sessionLifecycle';

export function useLatestRequest() {
  const guard = useRef<ReturnType<typeof createLatestRequestGuard> | null>(null);
  guard.current ||= createLatestRequestGuard();
  const { invalidate } = guard.current;
  useEffect(() => invalidate, [invalidate]);
  return guard.current;
}
