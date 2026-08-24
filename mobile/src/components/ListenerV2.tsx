import { Image } from 'expo-image';
import { useRouter, useSegments } from 'expo-router';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Menu,
  Music2,
  Pause,
  Play,
  Radio,
  Search,
  X,
} from 'lucide-react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooBrand } from '@/src/components/EchooBrand';
import { getListenerTabBarMetrics } from '@/src/navigation/listenerLayout';
import { usePlayback } from '@/src/playback/PlaybackProvider';
import { getUnreadNotificationCount } from '@/src/services/notificationService';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export function useListenerPalette() {
  const scheme = useColorScheme();
  return getEchooColors(scheme);
}

export function ListenerTopBar({
  onMenu,
  onNotifications,
  notificationCount,
}: {
  onMenu?: () => void;
  onNotifications?: () => void;
  notificationCount?: number;
}) {
  const router = useRouter();
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [unreadCount, setUnreadCount] = useState(notificationCount || 0);

  useEffect(() => {
    if (notificationCount !== undefined) {
      setUnreadCount(notificationCount);
      return;
    }

    let active = true;
    getUnreadNotificationCount()
      .then((count) => {
        if (active) setUnreadCount(count);
      })
      .catch(() => {
        if (active) setUnreadCount(0);
      });

    return () => {
      active = false;
    };
  }, [notificationCount]);

  return (
    <View style={styles.topBar}>
      <Pressable
        style={styles.iconButton}
        onPress={onMenu || (() => router.push('/menu'))}
        accessibilityLabel="Open menu"
      >
        <Menu color={palette.ink} size={25} strokeWidth={2.1} />
      </Pressable>

      <EchooBrand markSize={46} textSize={23} textColor={palette.ink} gap={0} />

      <Pressable
        style={styles.notificationButton}
        onPress={onNotifications || (() => router.push('/notifications'))}
        accessibilityLabel="Notifications"
      >
        <Bell color={palette.ink} size={22} strokeWidth={2.1} />
        {unreadCount > 0 ? (
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationBadgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export function ListenerPageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={styles.pageHeader}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.pageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function ListenerSectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} style={styles.sectionActionWrap}>
          <Text style={styles.sectionAction}>{action}</Text>
          <ChevronRight color={palette.blue} size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListenerSearchInput({
  value,
  onChangeText,
  placeholder = 'Search Echoo',
  autoFocus = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={styles.searchBox}>
      <Search color={palette.muted} size={20} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        style={styles.searchInput}
        returnKeyType="search"
      />
    </View>
  );
}

export function ListenerEmptyState({
  title,
  subtitle,
  icon,
  action,
  onAction,
}: {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        {icon || <Headphones color={palette.blue} size={24} />}
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {action ? (
        <Pressable style={styles.primaryButton} onPress={onAction}>
          <Text style={styles.primaryButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListenerAuthCard({
  title = 'Sign in to make Echoo yours',
  subtitle = 'Save audio, follow stations, sync history and keep your library across devices.',
  onPress,
}: {
  title?: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={styles.authCard}>
      <View style={styles.authIcon}>
        <Headphones color="#FFFFFF" size={25} />
      </View>
      <View style={styles.authCopy}>
        <Text style={styles.authTitle}>{title}</Text>
        <Text style={styles.authSubtitle}>{subtitle}</Text>
      </View>
      <Pressable style={styles.authButton} onPress={onPress}>
        <Text style={styles.authButtonText}>Sign in</Text>
      </Pressable>
    </View>
  );
}

export function ListenerListRow({
  title,
  subtitle,
  meta,
  image,
  fallback,
  trailing,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  image?: string | null;
  fallback?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <Pressable style={styles.listRow} onPress={onPress} disabled={!onPress}>
      <View style={styles.listArt}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          fallback || <Music2 color={palette.blue} size={21} />
        )}
      </View>
      <View style={styles.listCopy}>
        <Text style={styles.listTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.listSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={styles.listMeta}>{meta}</Text> : null}
      {trailing || null}
    </Pressable>
  );
}

export function ListenerMiniPlayer() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { current, duration, isLoading, isPlaying, position, stop, toggle } = usePlayback();

  const rootRoute = String(segments[0] || '');
  if (!current || rootRoute === 'audio-player' || rootRoute === 'live-room') return null;
  const bottomOffset = rootRoute === '(tabs)'
    ? getListenerTabBarMetrics(insets.bottom).height
    : insets.bottom + 12;

  const openPlayer = () => {
    if (current.kind === 'audio') router.push('/audio-player');
    else {
      router.push({
        pathname: '/live-room',
        params: {
          broadcastId: current.id,
          title: current.title,
          stationName: current.subtitle,
          coverArt: current.coverArt || '',
        },
      });
    }
  };

  const progress = current.kind === 'audio' && duration > 0
    ? Math.max(0, Math.min(100, (position / duration) * 100))
    : 0;

  return (
    <View style={[styles.miniPlayer, { bottom: bottomOffset }]}>
      <Pressable style={styles.miniOpenArea} onPress={openPlayer} accessibilityLabel="Open player">
        <View style={styles.miniArt}>
          {current.coverArt ? (
            <Image source={{ uri: current.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : current.kind === 'live' ? (
            <Radio color="#FFFFFF" size={19} />
          ) : (
            <Music2 color="#FFFFFF" size={18} />
          )}
        </View>
        <View style={styles.miniCopy}>
          <Text style={styles.miniTitle} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.miniSubtitle} numberOfLines={1}>
            {current.kind === 'live' ? `LIVE · ${current.subtitle}` : current.subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.miniPlayButton}
        onPress={toggle}
        disabled={isLoading}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause color="#FFFFFF" fill="#FFFFFF" size={18} />
        ) : (
          <Play color="#FFFFFF" fill="#FFFFFF" size={18} />
        )}
      </Pressable>
      <Pressable style={styles.miniCloseButton} onPress={stop} accessibilityLabel="Stop playback">
        <X color={palette.muted} size={18} />
      </Pressable>
      {current.kind === 'audio' ? (
        <View style={styles.miniProgressTrack}>
          <View style={[styles.miniProgressFill, { width: `${progress}%` }]} />
        </View>
      ) : (
        <View style={[styles.miniProgressTrack, styles.miniLiveTrack]} />
      )}
    </View>
  );
}

export function ListenerBackHeader({ title }: { title: string }) {
  const router = useRouter();
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={styles.backHeader}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <ChevronLeft color={palette.ink} size={25} />
      </Pressable>
      <Text style={styles.backTitle}>{title}</Text>
      <View style={styles.backSpacer} />
    </View>
  );
}

const makeStyles = (palette: EchooColors) =>
  StyleSheet.create({
    topBar: { height: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, zIndex: 20, elevation: 2 },
    iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    notificationButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
    pageHeader: { paddingTop: 16, paddingBottom: 18 },
    eyebrow: { color: palette.blue, fontSize: 11, fontWeight: '900', letterSpacing: 0 },
    pageTitle: { color: palette.ink, fontSize: 31, lineHeight: 35, fontWeight: '900', letterSpacing: 0, marginTop: 5 },
    pageSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 350 },
    sectionHeader: { marginTop: 26, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
    sectionActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    sectionAction: { color: palette.blue, fontSize: 12, fontWeight: '800' },
    searchBox: { minHeight: 52, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: palette.line, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    searchInput: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '600', paddingVertical: 13 },
    emptyCard: { backgroundColor: palette.surfaceRaised, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 22, alignItems: 'center' },
    emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
    emptySubtitle: { color: palette.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 300 },
    primaryButton: { marginTop: 15, height: 42, borderRadius: 13, backgroundColor: palette.blue, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    authCard: { backgroundColor: palette.surfaceRaised, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 16, alignItems: 'center', gap: 12 },
    authIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
    authCopy: { alignItems: 'center' },
    authTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
    authSubtitle: { color: palette.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 4, maxWidth: 315 },
    authButton: { height: 42, minWidth: 112, borderRadius: 13, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    authButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    listRow: { minHeight: 68, backgroundColor: 'transparent', borderRadius: 14, borderWidth: 0, paddingVertical: 8, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    listArt: { width: 54, height: 54, borderRadius: 10, backgroundColor: palette.blueSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    listCopy: { flex: 1, paddingHorizontal: 11 },
    listTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
    listSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
    listMeta: { color: palette.muted, fontSize: 11, fontWeight: '700', marginRight: 6 },
    miniPlayer: { position: 'absolute', left: 8, right: 8, minHeight: 64, borderRadius: 8, backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.lineStrong, flexDirection: 'row', alignItems: 'center', padding: 8, paddingBottom: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 14 },
    miniOpenArea: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
    miniArt: { width: 46, height: 46, borderRadius: 8, backgroundColor: palette.blueDeep, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    miniCopy: { flex: 1, paddingHorizontal: 10 },
    miniTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' },
    miniSubtitle: { color: palette.muted, fontSize: 11, marginTop: 2 },
    miniPlayButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    miniCloseButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
    miniProgressTrack: { position: 'absolute', left: 8, right: 8, bottom: 0, height: 2, borderRadius: 1, backgroundColor: palette.lineStrong, overflow: 'hidden' },
    miniProgressFill: { height: '100%', borderRadius: 1, backgroundColor: palette.blue },
    miniLiveTrack: { backgroundColor: palette.red },
    backHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    backTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
    backSpacer: { width: 42 },
  });
