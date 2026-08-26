import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import {
  ImageStyle,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {
  Bell,
  ChevronRight,
  Headphones,
  Music2,
  Play,
  Search,
} from 'lucide-react-native';

import { EchooBrand } from '@/src/components/EchooBrand';
import { colors, shadow } from '@/src/theme/echooTheme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#f2f5ff', '#f8f9fb', '#f8f9fb']}
        style={styles.appWash}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

export function AppTopBar({
  title = 'Echoo',
  subtitle = 'Audio-first',
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.topBar}>
      <EchooBrand markSize={50} showText={false} />
      <View style={styles.topCopy}>
        <Text style={styles.topTitle}>{title}</Text>
        <Text style={styles.topSubtitle}>{subtitle}</Text>
      </View>
      <Pressable style={styles.iconButton}>
        <Bell color={colors.ink2} size={20} />
      </Pressable>
    </View>
  );
}

export function SearchPill({ placeholder = 'Search music, stations, creators' }: { placeholder?: string }) {
  return (
    <Pressable style={styles.searchPill}>
      <Search color={colors.muted} size={19} />
      <Text style={styles.searchPlaceholder}>{placeholder}</Text>
    </Pressable>
  );
}

export function Header({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function FeaturedPlayer({
  title,
  subtitle,
  badge,
  image,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  image?: string | ImageSourcePropType | null;
}) {
  const source = typeof image === 'string' ? { uri: image } : image;

  return (
    <LinearGradient colors={['#0B0F17', '#244A86', '#4F7EC3']} style={styles.featured}>
      <View style={styles.featuredBackPlate} />
      <View style={styles.featuredArt}>
        {source ? <Image source={source} style={styles.imageFill} /> : <Text style={styles.featuredInitial}>E</Text>}
      </View>
      <View style={styles.featuredCopy}>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Text style={styles.featuredTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.featuredSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Pressable style={styles.playButton}>
        <Play color="#fff" fill="#fff" size={22} />
      </Pressable>
    </LinearGradient>
  );
}

export function QuickCard({
  title,
  subtitle,
  tone = colors.blue,
  icon = 'music',
}: {
  title: string;
  subtitle: string;
  tone?: string;
  icon?: 'music' | 'headphones';
}) {
  const Icon = icon === 'headphones' ? Headphones : Music2;

  return (
    <Pressable style={styles.quickCard}>
      <View style={[styles.quickTone, { backgroundColor: tone }]} />
      <View style={[styles.quickIcon, { backgroundColor: `${tone}18` }]}>
        <Icon color={tone} size={21} />
      </View>
      <Text style={styles.quickTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.quickSubtitle} numberOfLines={2}>{subtitle}</Text>
    </Pressable>
  );
}

export function Section({
  title,
  action = '',
  children,
}: {
  title: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action ? (
          <View style={styles.sectionAction}>
            <Text style={styles.sectionActionText}>{action}</Text>
            <ChevronRight color={colors.blue} size={16} />
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function HorizontalRail({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {children}
    </ScrollView>
  );
}

export function MediaCard({
  title,
  subtitle,
  image,
  live = false,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  image?: string | null;
  live?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable style={[styles.mediaCard, wide && styles.mediaCardWide]}>
      <View style={[styles.mediaArt, wide && styles.mediaArtWide]}>
        {image ? <Image source={{ uri: image }} style={styles.imageFill} /> : <Text style={styles.mediaInitial}>{title.charAt(0)}</Text>}
        {live ? <Text style={styles.livePill}>LIVE</Text> : null}
      </View>
      <Text style={styles.mediaTitle} numberOfLines={1}>{title}</Text>
      {subtitle ? <Text style={styles.mediaSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </Pressable>
  );
}

export function PlaylistChip({
  title,
  tone = colors.blue,
}: {
  title: string;
  tone?: string;
}) {
  return (
    <Pressable style={[styles.playlistChip, { backgroundColor: tone }]}>
      <Text style={styles.playlistChipText}>{title}</Text>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  image,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  image?: string | null;
}) {
  return (
    <Pressable style={styles.row}>
      <View style={styles.rowArt}>
        {image ? <Image source={{ uri: image }} style={styles.imageFill} /> : <Text style={styles.rowInitial}>{title.charAt(0)}</Text>}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
    </Pressable>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

export function MiniPlayer({
  title = 'Choose something to play',
  subtitle = 'Echoo',
  image,
}: {
  title?: string;
  subtitle?: string;
  image?: string | null;
}) {
  return (
    <View style={styles.miniPlayer}>
      <View style={styles.miniArt}>
        {image ? <Image source={{ uri: image }} style={styles.imageFill} /> : <Text style={styles.miniInitial}>E</Text>}
      </View>
      <View style={styles.miniCopy}>
        <Text style={styles.miniTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.miniSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Pressable style={styles.miniPlay}>
        <Play color="#fff" fill="#fff" size={16} />
      </Pressable>
    </View>
  );
}

type EchooMobileStyles = {
  root: ViewStyle;
  appWash: ViewStyle;
  screen: ViewStyle;
  screenContent: ViewStyle;
  topBar: ViewStyle;
  topCopy: ViewStyle;
  topTitle: TextStyle;
  topSubtitle: TextStyle;
  iconButton: ViewStyle;
  searchPill: ViewStyle;
  searchPlaceholder: TextStyle;
  header: ViewStyle;
  eyebrow: TextStyle;
  title: TextStyle;
  subtitle: TextStyle;
  featured: ViewStyle;
  featuredBackPlate: ViewStyle;
  featuredArt: ViewStyle;
  featuredInitial: TextStyle;
  featuredCopy: ViewStyle;
  badge: TextStyle;
  featuredTitle: TextStyle;
  featuredSubtitle: TextStyle;
  playButton: ViewStyle;
  section: ViewStyle;
  sectionHead: ViewStyle;
  sectionTitle: TextStyle;
  sectionAction: ViewStyle;
  sectionActionText: TextStyle;
  rail: ViewStyle;
  mediaCard: ViewStyle;
  mediaCardWide: ViewStyle;
  mediaArt: ViewStyle;
  mediaArtWide: ViewStyle;
  imageFill: ImageStyle;
  mediaInitial: TextStyle;
  livePill: TextStyle;
  mediaTitle: TextStyle;
  mediaSubtitle: TextStyle;
  playlistChip: ViewStyle;
  playlistChipText: TextStyle;
  row: ViewStyle;
  rowArt: ViewStyle;
  rowInitial: TextStyle;
  rowCopy: ViewStyle;
  rowTitle: TextStyle;
  rowSubtitle: TextStyle;
  rowMeta: TextStyle;
  empty: ViewStyle;
  emptyTitle: TextStyle;
  emptySubtitle: TextStyle;
  miniPlayer: ViewStyle;
  miniArt: ViewStyle;
  miniInitial: TextStyle;
  miniCopy: ViewStyle;
  miniTitle: TextStyle;
  miniSubtitle: TextStyle;
  miniPlay: ViewStyle;
  quickCard: ViewStyle;
  quickTone: ViewStyle;
  quickIcon: ViewStyle;
  quickTitle: TextStyle;
  quickSubtitle: TextStyle;
};

export const styles = StyleSheet.create<EchooMobileStyles>({
  root: { flex: 1, backgroundColor: colors.paper },
  appWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  screen: { flex: 1 },
  screenContent: { padding: 18, paddingTop: 56, paddingBottom: 104, gap: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topCopy: { flex: 1 },
  topTitle: { color: colors.ink, fontWeight: '900', fontSize: 22, letterSpacing: 0 },
  topSubtitle: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  searchPill: { height: 50, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow },
  searchPlaceholder: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  header: { gap: 6 },
  eyebrow: { color: colors.blue, fontSize: 12, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: 0 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  featured: { minHeight: 286, borderRadius: 22, padding: 18, overflow: 'hidden', justifyContent: 'flex-end', ...shadow },
  featuredBackPlate: { position: 'absolute', top: 28, alignSelf: 'center', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.09)' },
  featuredArt: { position: 'absolute', top: 38, alignSelf: 'center', width: 170, height: 170, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  featuredInitial: { color: '#fff', fontSize: 48, fontWeight: '900' },
  featuredCopy: { gap: 6, paddingRight: 68 },
  badge: { alignSelf: 'flex-start', color: colors.blue, backgroundColor: '#fff', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', fontWeight: '900', fontSize: 10 },
  featuredTitle: { color: '#fff', fontSize: 28, lineHeight: 31, fontWeight: '900', letterSpacing: 0 },
  featuredSubtitle: { color: '#d9e5ff', fontSize: 13, fontWeight: '700' },
  playButton: { position: 'absolute', right: 18, bottom: 18, width: 54, height: 54, borderRadius: 27, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: 0 },
  sectionAction: { flexDirection: 'row', alignItems: 'center' },
  sectionActionText: { color: colors.blue, fontSize: 12, fontWeight: '800' },
  rail: { gap: 14, paddingRight: 18 },
  mediaCard: { width: 136, gap: 8 },
  mediaCardWide: { width: 214 },
  mediaArt: { width: 136, height: 136, backgroundColor: '#edf4ff', borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(38,93,255,0.08)' },
  mediaArtWide: { width: 210, height: 124 },
  imageFill: { width: '100%', height: '100%' },
  mediaInitial: { color: colors.blue, fontSize: 38, fontWeight: '900' },
  livePill: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.red, color: '#fff', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  mediaTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  mediaSubtitle: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  playlistChip: { width: 132, height: 78, borderRadius: 16, justifyContent: 'flex-end', padding: 12, ...shadow },
  playlistChipText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line },
  rowArt: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.blueSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowInitial: { color: colors.blue, fontSize: 21, fontWeight: '900' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  rowSubtitle: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  rowMeta: { color: colors.faint, fontSize: 12, fontWeight: '700' },
  empty: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 5 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  emptySubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  miniPlayer: { height: 64, backgroundColor: colors.ink, borderRadius: 18, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow },
  miniArt: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.blueDeep, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  miniInitial: { color: '#fff', fontSize: 18, fontWeight: '900' },
  miniCopy: { flex: 1 },
  miniTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  miniSubtitle: { color: '#d0d5dd', fontSize: 12, fontWeight: '600' },
  miniPlay: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  quickCard: { width: 162, minHeight: 122, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8, overflow: 'hidden', ...shadow },
  quickTone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  quickSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
});
