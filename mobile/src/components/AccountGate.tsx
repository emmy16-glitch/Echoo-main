import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { AccountLoadState } from '@/src/components/AccountLoadState';
import { getCurrentUser, hasEchooSession } from '@/src/services/echooApi';

export function AccountGate({ children, title = 'Your account' }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setReady(false); setError(false);
    void (async () => {
      try {
        if (!await hasEchooSession()) { if (active) router.replace('/auth'); return; }
        await getCurrentUser();
        if (active) setReady(true);
      } catch {
        const session = await hasEchooSession();
        if (!active) return;
        if (!session) router.replace('/auth');
        else setError(true);
      }
    })();
    return () => { active = false; };
  }, [router, retry]));
  if (ready) return children;
  return <AccountLoadState title={title} error={error} onRetry={() => setRetry((value) => value + 1)} onBack={() => router.back()} />;
}
