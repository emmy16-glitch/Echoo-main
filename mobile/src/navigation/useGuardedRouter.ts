import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

type Router = ReturnType<typeof useRouter>;
type PushTarget = Parameters<Router['push']>[0];
type ReplaceTarget = Parameters<Router['replace']>[0];

const DEFAULT_GUARD_MS = 700;

function routeKey(target: PushTarget | ReplaceTarget) {
  if (typeof target === 'string') return target;
  return JSON.stringify(target);
}

export function useGuardedRouter(guardMs = DEFAULT_GUARD_MS) {
  const router = useRouter();
  const lastNavigationRef = useRef({ key: '', at: 0 });

  const canNavigate = useCallback((target: PushTarget | ReplaceTarget) => {
    const key = routeKey(target);
    const now = Date.now();
    const last = lastNavigationRef.current;
    if (last.key === key && now - last.at < guardMs) return false;
    lastNavigationRef.current = { key, at: now };
    return true;
  }, [guardMs]);

  const push = useCallback((target: PushTarget) => {
    if (canNavigate(target)) router.push(target as never);
  }, [canNavigate, router]);

  const replace = useCallback((target: ReplaceTarget) => {
    if (canNavigate(target)) router.replace(target as never);
  }, [canNavigate, router]);

  return { router, push, replace };
}
