import { useEffect, useState } from 'react';

export default function NetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    let recoveryTimer = null;
    const handleOffline = () => {
      window.clearTimeout(recoveryTimer);
      setRecovered(false);
      setOnline(false);
    };
    const handleOnline = () => {
      setOnline(true);
      setRecovered(true);
      window.dispatchEvent(new CustomEvent('echoo:network-restored'));
      recoveryTimer = window.setTimeout(() => setRecovered(false), 2400);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.clearTimeout(recoveryTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (online && !recovered) return null;
  return (
    <div className={`echoo-network-status ${online ? 'is-online' : 'is-offline'}`} role="status" aria-live="polite">
      {online ? 'Back online · Refreshing Echoo' : 'You’re offline · Cached pages remain available'}
    </div>
  );
}
