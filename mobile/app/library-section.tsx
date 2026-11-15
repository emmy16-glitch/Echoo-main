import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Mic, MoreVertical, Play, RotateCw, Trash2, WifiOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioRowActions } from '@/src/components/AudioRowActions';
import { ListenerAuthCard, ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooAudio, EchooDownload, EchooPlaylist, EchooStation, getDownloads, getFollowedStations, getMyPlaylists, getSavedAudio, hasEchooSession, unfollowStation } from '@/src/services/echooApi';
import { LocalDownload, deleteLocalDownload, downloadAudioToDevice, getLocalDownloads } from '@/src/services/localDownloads';

type Section = 'liked' | 'downloads' | 'following' | 'playlists';
const BLUE = '#2B5FC0';
const TITLES: Record<Section, string> = { liked: 'Liked Track', downloads: 'Downloads', following: 'Following', playlists: 'Playlist' };
function uniqueById<T extends { id: string }>(rows: T[]) { const seen = new Set<string>(); return rows.filter((row) => { if (!row.id || seen.has(row.id)) return false; seen.add(row.id); return true; }); }
function toPlaybackItem(track: EchooAudio, uri = ''): AudioPlaybackItem { return { kind: 'audio', id: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || 'Echoo Audio', coverArt: track.coverArt || '', fileUrl: uri || track.fileUrl || '', genre: track.genre || '', stationId: track.stationId || '', stationName: track.stationName || '', collectionId: track.collectionId || '', collectionName: track.collectionName || '' }; }
function Artwork({ uri, style }: { uri?: string | null; style: object }) { return <View style={[styles.artwork, style]}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>; }
function ViewGlyph({ grid }: { grid: boolean }) { return grid ? <View style={styles.gridGlyph}>{[0, 1, 2, 3].map((item) => <View key={item} style={styles.gridTile} />)}</View> : <View style={styles.listGlyph}>{[0, 1, 2].map((item) => <View key={item} style={styles.listBar} />)}</View>; }

export default function LibrarySectionScreen() {
  const { section: rawSection } = useLocalSearchParams<{ section?: string }>();
  const section: Section = rawSection === 'downloads' || rawSection === 'following' || rawSection === 'playlists' ? rawSection : 'liked';
  const { router, push } = useGuardedRouter();
  const playback = usePlayback();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(151, Math.max(130, (width - 72) / 2));
  const [saved, setSaved] = useState<EchooAudio[]>([]);
  const [downloads, setDownloads] = useState<LocalDownload[]>([]);
  const [remoteDownloads, setRemoteDownloads] = useState<EchooDownload[]>([]);
  const [downloadsOffline, setDownloadsOffline] = useState(false);
  const [manage, setManage] = useState(false);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [playlists, setPlaylists] = useState<EchooPlaylist[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [grid, setGrid] = useState(section === 'liked');
  const [error, setError] = useState('');
  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const session = await hasEchooSession(); setSignedIn(session);
      if (section === 'liked') setSaved(session ? uniqueById(await getSavedAudio({ force })) : []);
      if (section === 'downloads') {
        if (session) {
          const [local, remote] = await Promise.allSettled([getLocalDownloads(), getDownloads()]);
          if (local.status === 'rejected') throw local.reason;
          setDownloads(local.value);
          setRemoteDownloads(remote.status === 'fulfilled' ? remote.value : []);
          setDownloadsOffline(remote.status === 'rejected');
        } else { setDownloads([]); setRemoteDownloads([]); setDownloadsOffline(false); }
      }
      if (section === 'following') setStations(session ? uniqueById(await getFollowedStations({ force })) : []);
      if (section === 'playlists') setPlaylists(session ? uniqueById(await getMyPlaylists({ force })) : []);
      setError('');
    } catch (cause) { setError(friendlyErrorMessage(cause, `Could not load ${TITLES[section].toLowerCase()}.`)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [section]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const tracks = section === 'downloads' ? downloads.flatMap((item) => item.track ? [item.track] : []) : saved;
  const queue = useMemo(() => tracks.map((track) => toPlaybackItem(track, downloads.find((item) => item.trackId === track.id)?.localUri)), [tracks, downloads]);
  const openTrack = async (track: EchooAudio) => {
    const localUri = downloads.find((item) => item.trackId === track.id)?.localUri || '';
    await playback.playAudioQueue(queue, Math.max(0, queue.findIndex((item) => item.id === track.id)));
    push({ pathname: '/audio-player', params: { audioId: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || '', coverArt: track.coverArt || '', fileUrl: localUri || track.fileUrl || '' } });
  };
  const openPlaylist = (item: EchooPlaylist) => push({ pathname: '/collection', params: { collectionId: item.id, stationId: item.stationId || '', stationName: item.stationName || '' } });
  const stationMenu = (item: EchooStation) => Alert.alert(item.name, 'Manage this channel', [{ text: 'Cancel', style: 'cancel' }, { text: 'View channel', onPress: () => push({ pathname: '/station', params: { stationId: item.id } }) }, { text: 'Unfollow', style: 'destructive', onPress: () => void unfollowStation(item.id).then(() => load(true)).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not unfollow channel.'))) }]);
  const activeDownloads = remoteDownloads.filter((item) => item.trackId && !downloads.some((local) => local.trackId === item.trackId) && ['pending', 'downloading'].includes(item.status));
  const failedDownloads = remoteDownloads.filter((item) => item.trackId && !downloads.some((local) => local.trackId === item.trackId) && ['failed', 'paused'].includes(item.status));
  const removeDownload = (item: LocalDownload) => Alert.alert('Remove download?', 'This only removes the offline copy on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void deleteLocalDownload(item).then(() => load(true)).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not remove download.'))) }]);
  const retryDownload = (item: EchooDownload) => { if (!item.track) return; void downloadAudioToDevice(item.track).then(() => load(true)).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not download audio.'))); };
  const count = section === 'liked' ? saved.length : section === 'downloads' ? downloads.length + activeDownloads.length + failedDownloads.length : section === 'following' ? stations.length : playlists.length;
  const gridItems = section === 'playlists' ? playlists : section === 'following' ? stations : tracks;
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={BLUE} colors={[BLUE]} />}>
    <Pressable style={styles.search} onPress={() => push('/search')} accessibilityRole="search" accessibilityLabel="Search channels and audio"><Text style={styles.searchText}>Channels, title, artist, shows</Text><Mic color="#050505" size={25} strokeWidth={2.5} /></Pressable>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><ChevronLeft color="#050505" size={25} /></Pressable><Text style={styles.heading}>{TITLES[section]}</Text>{section === 'liked' ? <Text style={styles.count}>{count} audios</Text> : null}{section === 'downloads' ? <Pressable style={styles.manageButton} onPress={() => setManage((current) => !current)} accessibilityRole="button" accessibilityLabel={manage ? 'Done managing downloads' : 'Manage downloads'}>{manage ? null : <Trash2 color={BLUE} size={16} />}<Text style={styles.manageText}>{manage ? 'Done' : 'Manage'}</Text></Pressable> : <Pressable onPress={() => setGrid((current) => !current)} style={styles.viewButton} accessibilityRole="button" accessibilityLabel={grid ? 'Show list' : 'Show grid'}><ViewGlyph grid={grid} /></Pressable>}</View>
    {error ? <ListenerToast message={error} /> : null}
    {loading ? <View style={styles.skeletonInset}><ListenerSkeletonRows count={6} /></View> : null}
    {!loading && !signedIn ? <ListenerAuthCard title="Sign in to see your library" subtitle="Your saved content is linked to your account." onPress={() => push('/auth')} /> : null}
    {!loading && signedIn && !count && section !== 'downloads' ? <ListenerEmptyState title={section === 'liked' ? 'No liked tracks yet' : section === 'following' ? 'No followed channels yet' : 'No playlists yet'} subtitle="Items you save will appear here." action="Explore audio" onAction={() => push('/search')} /> : null}
    {!loading && signedIn && section === 'downloads' ? <View style={styles.downloadContent}>
      {downloadsOffline ? <View style={styles.offlineNotice}><WifiOff color={BLUE} size={19} /><Text style={styles.offlineText}>Couldn’t refresh downloads. Saved audio is ready to play.</Text></View> : null}
      <Text style={styles.downloadSummary}>{downloads.length} available · {activeDownloads.length} downloading · {failedDownloads.length} needs attention</Text>
      {manage ? <Text style={styles.manageHint}>Tap a downloaded audio to remove its offline copy.</Text> : null}
      {activeDownloads.length ? <><Text style={styles.downloadHeading}>Downloading</Text>{activeDownloads.map((item) => <View key={item.trackId} style={styles.downloadItem}><View style={styles.downloadRow}><Artwork uri={item.track?.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.track?.title || 'Audio'}</Text><Text style={styles.rowSubtitle}>{item.status === 'paused' ? 'Paused' : 'Downloading'} · {Math.round(item.progress)}%</Text></View></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, item.progress))}%` }]} /></View></View>)}</> : null}
      {failedDownloads.length ? <><Text style={styles.downloadHeading}>Needs attention</Text>{failedDownloads.map((item) => <View key={item.trackId} style={styles.downloadItem}><View style={styles.downloadRow}><Artwork uri={item.track?.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.track?.title || 'Audio'}</Text><Text style={styles.rowSubtitle}>Download {item.status}</Text></View><Pressable style={styles.action} onPress={() => retryDownload(item)} accessibilityLabel={`Retry ${item.track?.title || 'download'}`}><RotateCw color="#858585" size={22} /></Pressable></View><Pressable style={styles.retryLink} onPress={() => retryDownload(item)}><Text style={styles.retryText}>Retry download</Text></Pressable></View>)}</> : null}
      <Text style={styles.downloadHeading}>Downloaded</Text>
      {downloads.length ? downloads.map((item) => <Pressable key={item.trackId} style={styles.downloadRow} onPress={() => item.track && !manage ? void openTrack(item.track) : removeDownload(item)}><Artwork uri={item.track?.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.track?.title || 'Downloaded audio'}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{item.track?.stationName || item.track?.artistName || 'Available offline'}</Text></View>{manage ? <Trash2 color="#858585" size={22} /> : <View style={styles.play}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View>}</Pressable>) : <Text style={styles.downloadEmpty}>Audio you download will be ready to play here.</Text>}
      <View style={styles.offlineNotice}><Text style={styles.offlineText}>Removing a download only deletes the copy on this device.</Text></View>
    </View> : null}
    {!loading && signedIn && count > 0 && section !== 'downloads' && grid ? <View style={styles.grid}>{gridItems.map((item) => {
      const isPlaylist = section === 'playlists'; const isStation = section === 'following'; const title = isPlaylist ? (item as EchooPlaylist).name : isStation ? (item as EchooStation).name : (item as EchooAudio).title;
      const subtitle = isPlaylist ? ((item as EchooPlaylist).stationName || (item as EchooPlaylist).owner?.displayName || 'By you') : isStation ? `${(item as EchooStation).followerCount || 0} followers` : ((item as EchooAudio).stationName || (item as EchooAudio).artistName || 'Echoo Audio');
      return <Pressable key={item.id} style={{ width: cardWidth }} onPress={() => isPlaylist ? openPlaylist(item as EchooPlaylist) : isStation ? push({ pathname: '/station', params: { stationId: item.id } }) : void openTrack(item as EchooAudio)}><Artwork uri={item.coverArt} style={{ width: cardWidth, height: cardWidth, borderRadius: 20 }} /><Text style={styles.gridTitle} numberOfLines={1}>{title}</Text><Text style={styles.gridSubtitle} numberOfLines={1}>{subtitle}</Text></Pressable>;
    })}</View> : null}
    {!loading && signedIn && count > 0 && section !== 'downloads' && !grid ? <View style={styles.list}>{section === 'following' ? stations.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => push({ pathname: '/station', params: { stationId: item.id } })}><Artwork uri={item.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.followerCount || 0} followers</Text></View><Pressable style={styles.action} onPress={() => stationMenu(item)} accessibilityLabel={`Options for ${item.name}`}><MoreVertical color="#050505" size={21} /></Pressable></Pressable>) : section === 'playlists' ? playlists.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => openPlaylist(item)}><Artwork uri={item.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.stationName || item.owner?.displayName || 'By you'}</Text></View></Pressable>) : tracks.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => void openTrack(item)}><Artwork uri={item.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{item.stationName || item.subtitle || item.artistName || 'Echoo Audio'}</Text></View><View style={styles.play}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View><AudioRowActions track={item} initialSaved={section === 'liked'} onChanged={() => void load(true)} /></Pressable>)}</View> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' }, content: { paddingTop: 22, paddingBottom: 150 },
  skeletonInset: { marginHorizontal: 24 },
  gridGlyph: { width: 22, height: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }, gridTile: { width: 9.5, height: 9.5, borderRadius: 2, backgroundColor: '#050505' },
  listGlyph: { width: 24, height: 22, justifyContent: 'space-between' }, listBar: { width: 24, height: 5, borderRadius: 2, backgroundColor: '#050505' }, manageButton: { marginLeft: 'auto', minWidth: 82, height: 38, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, manageText: { color: BLUE, fontFamily: 'DMSans_500Medium', fontSize: 14 }, manageHint: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 10 },
  downloadContent: { marginHorizontal: 24, marginTop: 20 }, downloadSummary: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 12 },
  downloadHeading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 20, marginTop: 13, marginBottom: 12 }, downloadItem: { marginBottom: 13 }, downloadRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#DFE2E6', overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: BLUE }, retryLink: { alignSelf: 'flex-end', paddingVertical: 5 }, retryText: { color: BLUE, fontFamily: 'DMSans_500Medium', fontSize: 13 },
  offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 9, backgroundColor: '#E6EEFC', padding: 13, marginVertical: 13 }, offlineText: { color: BLUE, fontFamily: 'DMSans_400Regular', fontSize: 13, flex: 1 }, downloadEmpty: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13 },
  search: { height: 48, borderRadius: 25, backgroundColor: '#F2F3F5', marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 31 }, searchText: { color: '#848484', fontFamily: 'DMSans_400Regular', fontSize: 16, flexShrink: 1 },
  header: { marginTop: 15, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 5 }, back: { width: 26, justifyContent: 'center' }, heading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.5 }, count: { alignSelf: 'flex-end', marginBottom: 3, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 11 }, viewButton: { marginLeft: 'auto', width: 35, height: 35, alignItems: 'center', justifyContent: 'center' },
  grid: { marginHorizontal: 24, marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 31 }, artwork: { overflow: 'hidden', backgroundColor: '#E8EAF0' }, gridTitle: { marginTop: 9, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 }, gridSubtitle: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 2 },
  list: { marginHorizontal: 24, marginTop: 18, gap: 12 }, row: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowArt: { width: 62, height: 58, borderRadius: 5 }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 }, rowSubtitle: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 3 }, action: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' }, play: { width: 24, height: 24, borderRadius: 12, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
});
