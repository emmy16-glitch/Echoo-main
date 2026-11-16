import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { useLatestRequest } from '@/src/navigation/useLatestRequest';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeSessionChanges } from '@/src/services/sessionLifecycle';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooUser, getCachedCurrentUserSnapshot, getCurrentUser, hasEchooSession } from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function ProfileScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    return () => { scrollRef.current?.scrollTo({ y: 0, animated: false }); };
  }, []));
  const { push, router } = useGuardedRouter();
  const { begin, invalidate } = useLatestRequest();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [user, setUser] = useState<EchooUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => subscribeSessionChanges(() => { invalidate(); setUser(null); setLoading(true); setError(''); }), [invalidate]);

  const load = useCallback(async (force = false) => {
    const active = begin();
    if (force) setRefreshing(true);
    try {
      const session = await hasEchooSession();
      const current = session ? await getCurrentUser({ force }) : null;
      if (!active()) return;
      setUser(current);
      setError('');
    } catch (cause) { if (active()) setError(friendlyErrorMessage(cause, 'Could not load your profile.')); }
    finally { if (active()) { setLoading(false); setRefreshing(false); } }
  }, [begin]);
  useFocusEffect(useCallback(() => {
    let active = true;
    const unsubscribe = subscribeSessionChanges(() => { if (active) void load(); });
    void (async () => {
      const session = await hasEchooSession();
      if (!active) return;
      if (session) {
        const cached = await getCachedCurrentUserSnapshot().catch(() => null);
        if (cached && active) { setUser(cached); setLoading(false); }
      }
      if (active) void load();
    })();
    return () => { active = false; unsubscribe(); invalidate(); };
  }, [load, invalidate]));

  const row = (title: string, subtitle: string, onPress: () => void) => <Pressable key={title} style={styles.row} onPress={onPress} accessibilityRole="button">
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><ChevronRight color={palette.muted} size={22} />
  </Pressable>;
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.blue} colors={[palette.blue]} />}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft color={palette.ink} size={24} /></Pressable><Text style={styles.headerTitle}>Profile</Text><Pressable onPress={() => push(user ? '/settings' : '/auth')} accessibilityRole="button"><Text style={styles.headerAction}>Settings</Text></Pressable></View>
    {loading && !user ? <View style={styles.skeleton}><ListenerSkeletonRows count={3} /></View> : null}
    {!loading ? <View style={styles.identity}>
      <View style={styles.avatar}>{user?.avatar ? <Image source={{ uri: user.avatar }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Text style={styles.initial}>{(user?.displayName || user?.username || 'Guest').charAt(0).toUpperCase()}</Text>}</View>
      <Text style={styles.name}>{user?.displayName || 'Guest listener'}</Text>
      <Text style={styles.handle}>{user ? `@${user.username}` : 'Welcome to Echoo'}</Text>
      {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      <Pressable style={styles.editButton} onPress={() => push(user ? '/edit-profile' : '/auth')} accessibilityRole="button"><Text style={styles.editText}>{user ? 'Edit profile' : 'Sign in / Sign up'}</Text></Pressable>
    </View> : null}
    {error ? <ListenerToast message={error} /> : null}
    <Text style={styles.sectionTitle}>Your listening space</Text>
    {row('Library', 'Liked tracks, playlists and downloads', () => push('/library'))}
    {row('Listening history', 'Pick up where you left off', () => push('/listening-history'))}
    {row('Following', 'Your favourite channels', () => push({ pathname: '/library-section', params: { section: 'following' } }))}
    <Text style={styles.sectionTitle}>Make it yours</Text>
    {row('Discover more', 'Audio and channels picked for you', () => push('/made-for-you'))}
  </ScrollView></SafeAreaView>;
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background }, content: { paddingBottom: 150 },
  header: { marginHorizontal: 24, marginTop: 22, height: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { flex: 1, color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 23 }, headerAction: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  skeleton: { margin: 24 }, identity: { alignItems: 'center', marginTop: 48, marginHorizontal: 24 },
  avatar: { width: 86, height: 86, borderRadius: 43, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' }, initial: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 34 },
  name: { marginTop: 17, color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 25, textAlign: 'center' }, handle: { marginTop: 5, color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 14 }, email: { marginTop: 6, color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 12 },
  editButton: { alignSelf: 'stretch', marginTop: 18, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, editText: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  sectionTitle: { marginTop: 33, marginBottom: 12, marginHorizontal: 24, color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 17 }, row: { marginHorizontal: 24, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowCopy: { flex: 1 }, rowTitle: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 15 }, rowSubtitle: { marginTop: 4, color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 12 },
});
