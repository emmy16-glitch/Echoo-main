import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Bell,
  ChevronRight,
  Headphones,
  Menu,
  Music2,
  Play,
  Search,
} from 'lucide-react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooAudio } from '@/src/services/echooApi';
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

      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <View style={[styles.brandDot, styles.dotOne]} />
          <View style={[styles.brandDot, styles.dotTwo]} />
          <View style={[styles.brandDot, styles.dotThree]} />
        </View>
        <Text style={styles.brandText}>echoo</Text>
      </View>

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

export function ListenerMiniPlayer({
  audio,
  title,
  subtitle,
}: {
  audio?: EchooAudio | null;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const resolvedTitle = audio?.title || title;
  if (!resolvedTitle) return null;

  const openPlayer = () => {
    if (!audio) return;
    router.push({
      pathname: '/audio-player',
      params: {
        audioId: audio.id,
        title: audio.title,
        subtitle: audio.subtitle || audio.artistName || audio.genre || 'Echoo Audio',
        coverArt: audio.coverArt || '',
        fileUrl: audio.fileUrl || '',
        genre: audio.genre || '',
      },
    });
  };

  return (
    <Pressable style={styles.miniPlayer} onPress={openPlayer} disabled={!audio}>
      <View style={styles.miniArt}>
        {audio?.coverArt ? (
          <Image source={{ uri: audio.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <Music2 color="#FFFFFF" size={18} />
        )}
      </View>
      <View style={styles.miniCopy}>
        <Text style={styles.miniTitle} numberOfLines={1}>{resolvedTitle}</Text>
        <Text style={styles.miniSubtitle} numberOfLines={1}>
          {audio?.subtitle || subtitle || 'Echoo'}
        </Text>
      </View>
      <View style={styles.miniPlayButton}>
        <Play color="#FFFFFF" fill="#FFFFFF" size={17} />
      </View>
    </Pressable>
  );
}

export function ListenerBackHeader({ title }: { title: string }) {
  const router = useRouter();
  const palette = useListenerPalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={styles.backHeader}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.backTitle}>{title}</Text>
      <View style={styles.backSpacer} />
    </View>
  );
}

const makeStyles = (palette: EchooColors) =>
  StyleSheet.create({
    topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    brandMark: { width: 26, height: 26 },
    brandDot: { position: 'absolute', width: 13, height: 13, borderRadius: 7 },
    dotOne: { left: 1, top: 6, backgroundColor: '#2F63F6' },
    dotTwo: { right: 1, top: 2, backgroundColor: '#4B7BFF' },
    dotThree: { right: 3, bottom: 1, backgroundColor: '#7E9DFF', opacity: 0.78 },
    brandText: { color: palette.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
    notificationButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line },
    notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
    pageHeader: { paddingTop: 16, paddingBottom: 18 },
    eyebrow: { color: palette.blue, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    pageTitle: { color: palette.ink, fontSize: 31, lineHeight: 35, fontWeight: '900', letterSpacing: -1, marginTop: 5 },
    pageSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 350 },
    sectionHeader: { marginTop: 26, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
    sectionActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    sectionAction: { color: palette.blue, fontSize: 12, fontWeight: '800' },
    searchBox: { minHeight: 52, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    searchInput: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '600', paddingVertical: 13 },
    emptyCard: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 22, alignItems: 'center' },
    emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
    emptySubtitle: { color: palette.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 300 },
    primaryButton: { marginTop: 15, height: 42, borderRadius: 13, backgroundColor: palette.blue, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    authCard: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 16, alignItems: 'center', gap: 12 },
    authIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
    authCopy: { alignItems: 'center' },
    authTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
    authSubtitle: { color: palette.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 4, maxWidth: 315 },
    authButton: { height: 42, minWidth: 112, borderRadius: 13, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    authButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    listRow: { minHeight: 72, backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.line, padding: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
    listArt: { width: 50, height: 50, borderRadius: 13, backgroundColor: palette.blueSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    listCopy: { flex: 1, paddingHorizontal: 11 },
    listTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
    listSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
    listMeta: { color: palette.muted, fontSize: 11, fontWeight: '700', marginRight: 6 },
    miniPlayer: { position: 'absolute', left: 12, right: 12, bottom: 7, minHeight: 62, borderRadius: 18, backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.lineStrong, flexDirection: 'row', alignItems: 'center', padding: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
    miniArt: { width: 46, height: 46, borderRadius: 13, backgroundColor: palette.blueDeep, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    miniCopy: { flex: 1, paddingHorizontal: 10 },
    miniTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' },
    miniSubtitle: { color: palette.muted, fontSize: 11, marginTop: 2 },
    miniPlayButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
    backHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    backGlyph: { color: palette.ink, fontSize: 34, lineHeight: 35, marginTop: -3 },
    backTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
    backSpacer: { width: 42 },
  });
