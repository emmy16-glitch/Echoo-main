const GUEST_SESSION_KEY = 'echooGuestSessionV1';
const GUEST_MIGRATION_PREFIX = 'echooGuestListeningSnapshot:';

const safeParse = (value, fallback) => {
  try { return JSON.parse(value || ''); } catch { return fallback; }
};

const createId = () => (
  globalThis.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const getGuestSession = () => {
  const stored = safeParse(localStorage.getItem(GUEST_SESSION_KEY), null);
  if (stored?.id) return stored;
  const session = {
    id: createId(),
    createdAt: new Date().toISOString(),
    recentlyPlayed: [],
    playbackPosition: {},
    queue: [],
    lastOpenedContent: null,
    preferences: {},
  };
  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  return session;
};

export const updateGuestSession = (updater) => {
  const current = getGuestSession();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('echoo-guest-session-updated', { detail: next }));
  return next;
};

export const saveGuestPreferences = (preferences) => updateGuestSession((session) => ({
  ...session,
  preferences: { ...session.preferences, ...preferences },
}));

export const recordGuestPlayback = (track, position = 0, queue = null) => updateGuestSession((session) => {
  const id = String(track?.id || track?._id || '');
  if (!id) return session;
  const entry = {
    id,
    title: track.title || 'Untitled Audio',
    artistName: track.artistName || track.subtitle || 'Echoo Creator',
    fileUrl: track.fileUrl || '',
    coverArt: track.coverArt || track.artwork || '',
    duration: Number(track.duration) || 0,
    playedAt: new Date().toISOString(),
  };
  return {
    ...session,
    lastOpenedContent: { type: 'audio', id, openedAt: entry.playedAt },
    playbackPosition: { ...session.playbackPosition, [id]: Math.max(0, Number(position) || 0) },
    recentlyPlayed: [entry, ...session.recentlyPlayed.filter((item) => item.id !== id)].slice(0, 30),
    queue: Array.isArray(queue) ? queue.slice(0, 50) : session.queue,
  };
});

export const migrateGuestSessionToAccount = (user) => {
  const accountId = user?.id || user?._id;
  if (!accountId) return null;
  const session = getGuestSession();
  localStorage.setItem(`${GUEST_MIGRATION_PREFIX}${accountId}`, JSON.stringify({
    migratedAt: new Date().toISOString(),
    ...session,
  }));
  return session;
};

export const getMigratedGuestSession = (user) => safeParse(
  localStorage.getItem(`${GUEST_MIGRATION_PREFIX}${user?.id || user?._id || ''}`),
  null,
);

export const isAuthenticated = () => Boolean(localStorage.getItem('accessToken') || localStorage.getItem('token'));
