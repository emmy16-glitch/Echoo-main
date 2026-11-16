import { useMemo as useThemeMemo } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';
import { useFocusEffect } from '@react-navigation/native';
import { subscribeSessionChanges } from '@/src/services/sessionLifecycle';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Search, MoreVertical, Play, RotateCw, Trash2, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioRowActions } from '@/src/components/AudioRowActions';
import { ListenerAuthCard, ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooAudio, EchooDownload, EchooPlaylist, EchooStation, createPlaylist, getDownloads, getFollowedStations, getMyPlaylists, getSavedAudio, hasEchooSession, unfollowStation } from '@/src/services/echooApi';
import { LocalDownload, deleteLocalDownload, downloadAudioToDevice, getLocalDownloads, getActiveLocalDownloads, subscribeLocalDownloadStatus } from '@/src/services/localDownloads';

type Section = 'liked' | 'downloads' | 'following' | 'playlists';
const TITLES: Record<Section, string> = { liked: 'Liked Track', downloads: 'Downloads', following: 'Following', playlists: 'Playlist' };
function uniqueById<T extends { id: string }>(rows: T[]) { const seen = new Set<string>(); return rows.filter((row) => { if (!row.id || seen.has(row.id)) return false; seen.add(row.id); return true; }); }
function toPlaybackItem(track: EchooAudio, uri = ''): AudioPlaybackItem { return { kind: 'audio', id: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || 'Echoo Audio', coverArt: track.coverArt || '', fileUrl: uri || track.fileUrl || '', genre: track.genre || '', stationId: track.stationId || '', stationName: track.stationName || '', collectionId: track.collectionId || '', collectionName: track.collectionName || '' }; }
function Artwork({ uri, style }: { uri?: string | null; style: object }) {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);
 return <View style={[styles.artwork, style]}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>; }
function ViewGlyph({ grid }: { grid: boolean }) {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);
 return grid ? <View style={styles.gridGlyph}>{[0, 1, 2, 3].map((item) => <View key={item} style={styles.gridTile} />)}</View> : <View style={styles.listGlyph}>{[0, 1, 2].map((item) => <View key={item} style={styles.listBar} />)}</View>; }

export default function LibrarySectionScreen() {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);

  const { section: rawSection } = useLocalSearchParams<{ section?: string }>();
  const section: Section = rawSection === 'downloads' || rawSection === 'following' || rawSection === 'playlists' ? rawSection : 'liked';
  const { router, push } = useGuardedRouter();
  const playback = usePlayback();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(151, Math.max(130, (width - 72) / 2));
  const [saved, setSaved] = useState<EchooAudio[]>([]);
  const [downloads, setDownloads] = useState<LocalDownload[]>([]);
  const [remoteDownloads, setRemoteDownloads] = useState<EchooDownload[]>([]);
  const [deviceTransfers, setDeviceTransfers] = useState<LocalDownload[]>([]);
  const [downloadsOffline, setDownloadsOffline] = useState(false);
  const [manage, setManage] = useState(false);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [playlists, setPlaylists] = useState<EchooPlaylist[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [grid, setGrid] = useState(section === 'liked');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);
  const loadGeneration = useRef(0);
  useEffect(() => subscribeSessionChanges(() => {
    loadGeneration.current += 1;
    setSignedIn(false); setSaved([]); setDownloads([]); setRemoteDownloads([]); setStations([]); setPlaylists([]);
    setDeviceTransfers([]); setCreateOpen(false); setLoading(false);
  }), []);
  const load = useCallback(async (force = false) => {
    const generation = ++loadGeneration.current;
    const active = () => loadGeneration.current === generation;
    if (force) setRefreshing(true);
    try {
      const session = await hasEchooSession();
      if (!active()) return;
      setSignedIn(session);
      if (!session) {
        setSaved([]); setDownloads([]); setRemoteDownloads([]); setStations([]); setPlaylists([]);
        setDownloadsOffline(false); setError('');
        return;
      }
      if (section === 'liked') {
        const rows = await getSavedAudio({ force });
        if (active()) setSaved(uniqueById(rows));
      }
      if (section === 'downloads') {
        const local = await getLocalDownloads();
        if (!active()) return;
        setDownloads(local); setLoading(false); setRefreshing(false);
        try {
          const remote = await getDownloads();
          if (active()) { setRemoteDownloads(remote); setDownloadsOffline(false); }
        } catch {
          if (active()) { setRemoteDownloads([]); setDownloadsOffline(true); }
        }
      }
      if (section === 'following') { const rows = await getFollowedStations({ force }); if (active()) setStations(uniqueById(rows)); }
      if (section === 'playlists') { const rows = await getMyPlaylists({ force }); if (active()) setPlaylists(uniqueById(rows)); }
      if (active()) setError('');
    } catch (cause) { if (active()) setError(friendlyErrorMessage(cause, `Could not load ${TITLES[section].toLowerCase()}.`)); }
    finally { if (active()) { setLoading(false); setRefreshing(false); } }
  }, [section]);
  useFocusEffect(useCallback(() => {
    setLoading(true); setSignedIn(false);
    setSaved([]); setDownloads([]); setRemoteDownloads([]); setStations([]); setPlaylists([]);
    void load();
    const unsubscribe = subscribeSessionChanges(() => { void load(); });
    return () => { unsubscribe(); loadGeneration.current += 1; };
  }, [load]));
  useEffect(() => {
    if (section !== 'downloads' || !signedIn) { setDeviceTransfers([]); return; }
    let active = true;
    let previousTransfers = 0;
    const refreshTransfers = () => {
      void getActiveLocalDownloads().then(async (rows) => {
        if (!active) return;
        const finished = rows.length < previousTransfers;
        previousTransfers = rows.length;
        setDeviceTransfers(rows);
        if (finished) {
          const local = await getLocalDownloads();
          if (active) setDownloads(local);
        }
      }).catch(() => undefined);
    };
    refreshTransfers();
    const unsubscribe = subscribeLocalDownloadStatus(refreshTransfers);
    return () => { active = false; unsubscribe(); };
  }, [section, signedIn]);
  const tracks = section === 'downloads' ? downloads.flatMap((item) => item.track ? [item.track] : []) : saved;
  const queue = useMemo(() => tracks.map((track) => toPlaybackItem(track, downloads.find((item) => item.trackId === track.id)?.localUri)), [tracks, downloads]);
  const openTrack = async (track: EchooAudio) => {
    const localUri = downloads.find((item) => item.trackId === track.id)?.localUri || '';
    void playback.playAudioQueue(queue, Math.max(0, queue.findIndex((item) => item.id === track.id))).catch(() => undefined);
    push({ pathname: '/audio-player', params: { audioId: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || '', coverArt: track.coverArt || '', fileUrl: localUri || track.fileUrl || '' } });
  };
  const openPlaylist = (item: EchooPlaylist) => push({ pathname: '/collection', params: { collectionId: item.id, stationId: item.stationId || '', stationName: item.stationName || '' } });
  const createPersonalPlaylist = async () => {
    if (creating || !playlistName.trim()) return;
    const generation = loadGeneration.current;
    setCreating(true); setError('');
    try {
      const playlist = await createPlaylist({ name: playlistName.trim(), isPublic: false });
      if (generation !== loadGeneration.current) return;
      setCreateOpen(false); setPlaylistName('');
      setPlaylists((rows) => [playlist, ...rows]);
      openPlaylist(playlist);
    } catch (cause) { if (generation === loadGeneration.current) setError(friendlyErrorMessage(cause, 'Could not create playlist.')); }
    finally { setCreating(false); }
  };
  const stationMenu = (item: EchooStation) => Alert.alert(item.name, 'Manage this channel', [{ text: 'Cancel', style: 'cancel' }, { text: 'View channel', onPress: () => push({ pathname: '/station', params: { stationId: item.id } }) }, { text: 'Unfollow', style: 'destructive', onPress: () => void unfollowStation(item.id).then(() => load(true)).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not unfollow channel.'))) }]);
  const activeDownloads = deviceTransfers;
  const failedDownloads = remoteDownloads.filter((item) => item.trackId && !downloads.some((local) => local.trackId === item.trackId) && !deviceTransfers.some((local) => local.trackId === item.trackId));
  const removeDownload = (item: LocalDownload) => Alert.alert('Remove download?', 'This only removes the offline copy on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void deleteLocalDownload(item).then(() => load(true)).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not remove download.'))) }]);
  const retryDownload = (item: EchooDownload) => { if (!item.track) return; void downloadAudioToDevice(item.track).then(() => load(true)).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not download audio.'))); };
  const count = section === 'liked' ? saved.length : section === 'downloads' ? downloads.length + activeDownloads.length + failedDownloads.length : section === 'following' ? stations.length : playlists.length;
  const gridItems = section === 'playlists' ? playlists : section === 'following' ? stations : tracks;
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.blue} colors={[palette.blue]} />}>
    <Pressable style={styles.search} onPress={() => push('/search')} accessibilityRole="search" accessibilityLabel="Search channels and audio"><Text style={styles.searchText}>Channels, title, artist, shows</Text><Search color={palette.ink} size={25} strokeWidth={2.5} /></Pressable>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><ChevronLeft color={palette.ink} size={25} /></Pressable><Text style={styles.heading}>{TITLES[section]}</Text>{section === 'liked' ? <Text style={styles.count}>{count} audios</Text> : null}{section === 'downloads' ? <Pressable style={styles.manageButton} onPress={() => setManage((current) => !current)} accessibilityRole="button" accessibilityLabel={manage ? 'Done managing downloads' : 'Manage downloads'}>{manage ? null : <Trash2 color={palette.blue} size={16} />}<Text style={styles.manageText}>{manage ? 'Done' : 'Manage'}</Text></Pressable> : <Pressable onPress={() => setGrid((current) => !current)} style={styles.viewButton} accessibilityRole="button" accessibilityLabel={grid ? 'Show list' : 'Show grid'}><ViewGlyph grid={grid} /></Pressable>}</View>
    {error ? <ListenerToast message={error} /> : null}
    {section === 'playlists' && signedIn ? <Pressable accessibilityRole="button" style={styles.createPlaylist} onPress={() => setCreateOpen(true)}><Text style={styles.manageText}>Create playlist</Text></Pressable> : null}
    {loading ? <View style={styles.skeletonInset}><ListenerSkeletonRows count={6} /></View> : null}
    {!loading && !signedIn ? <ListenerAuthCard title="Sign in to see your library" subtitle="Your saved content is linked to your account." onPress={() => push('/auth')} /> : null}
    {!loading && signedIn && !count && section !== 'downloads' ? <ListenerEmptyState title={section === 'liked' ? 'No liked tracks yet' : section === 'following' ? 'No followed channels yet' : 'No playlists yet'} subtitle="Items you save will appear here." action="Explore audio" onAction={() => push('/search')} /> : null}
    {!loading && signedIn && section === 'downloads' ? <View style={styles.downloadContent}>
      {downloadsOffline ? <View style={styles.offlineNotice}><WifiOff color={palette.blue} size={19} /><Text style={styles.offlineText}>Couldn’t refresh downloads. Saved audio is ready to play.</Text></View> : null}
      <Text style={styles.downloadSummary}>{downloads.length} available · {activeDownloads.length} downloading · {failedDownloads.length} needs attention</Text>
      {manage ? <Text style={styles.manageHint}>Tap a downloaded audio to remove its offline copy.</Text> : null}
      {activeDownloads.length ? <><Text style={styles.downloadHeading}>Downloading</Text>{activeDownloads.map((item) => <View key={item.trackId} style={styles.downloadItem}><View style={styles.downloadRow}><Artwork uri={item.track?.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.track?.title || 'Audio'}</Text><Text style={styles.rowSubtitle}>{item.status === 'paused' ? 'Paused' : 'Downloading'} · {Math.round(item.progress)}%</Text></View></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, item.progress))}%` }]} /></View></View>)}</> : null}
      {failedDownloads.length ? <><Text style={styles.downloadHeading}>Save to this device</Text>{failedDownloads.map((item) => <View key={item.trackId} style={styles.downloadItem}><View style={styles.downloadRow}><Artwork uri={item.track?.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.track?.title || 'Audio'}</Text><Text style={styles.rowSubtitle}>{item.status === 'completed' ? 'Not saved on this device' : 'Download incomplete'}</Text></View><Pressable style={styles.action} onPress={() => retryDownload(item)} accessibilityLabel={`Download ${item.track?.title || 'audio'}`}><RotateCw color={palette.muted} size={22} /></Pressable></View><Pressable style={styles.retryLink} onPress={() => retryDownload(item)}><Text style={styles.retryText}>Download to device</Text></Pressable></View>)}</> : null}
      <Text style={styles.downloadHeading}>Downloaded</Text>
      {downloads.length ? downloads.map((item) => <Pressable key={item.trackId} style={styles.downloadRow} onPress={() => item.track && !manage ? void openTrack(item.track) : removeDownload(item)}><Artwork uri={item.track?.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.track?.title || 'Downloaded audio'}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{item.track?.stationName || item.track?.artistName || 'Available offline'}</Text></View>{manage ? <Trash2 color={palette.muted} size={22} /> : <View style={styles.play}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View>}</Pressable>) : <Text style={styles.downloadEmpty}>Audio you download will be ready to play here.</Text>}
      <View style={styles.offlineNotice}><Text style={styles.offlineText}>Removing a download only deletes the copy on this device.</Text></View>
    </View> : null}
    {!loading && signedIn && count > 0 && section !== 'downloads' && grid ? <View style={styles.grid}>{gridItems.map((item) => {
      const isPlaylist = section === 'playlists'; const isStation = section === 'following'; const title = isPlaylist ? (item as EchooPlaylist).name : isStation ? (item as EchooStation).name : (item as EchooAudio).title;
      const subtitle = isPlaylist ? ((item as EchooPlaylist).stationName || (item as EchooPlaylist).owner?.displayName || 'By you') : isStation ? `${(item as EchooStation).followerCount || 0} followers` : ((item as EchooAudio).stationName || (item as EchooAudio).artistName || 'Echoo Audio');
      return <Pressable key={item.id} style={{ width: cardWidth }} onPress={() => isPlaylist ? openPlaylist(item as EchooPlaylist) : isStation ? push({ pathname: '/station', params: { stationId: item.id } }) : void openTrack(item as EchooAudio)}><Artwork uri={item.coverArt} style={{ width: cardWidth, height: cardWidth, borderRadius: 20 }} /><Text style={styles.gridTitle} numberOfLines={1}>{title}</Text><Text style={styles.gridSubtitle} numberOfLines={1}>{subtitle}</Text></Pressable>;
    })}</View> : null}
    {!loading && signedIn && count > 0 && section !== 'downloads' && !grid ? <View style={styles.list}>{section === 'following' ? stations.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => push({ pathname: '/station', params: { stationId: item.id } })}><Artwork uri={item.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.followerCount || 0} followers</Text></View><Pressable style={styles.action} onPress={() => stationMenu(item)} accessibilityLabel={`Options for ${item.name}`}><MoreVertical color={palette.ink} size={21} /></Pressable></Pressable>) : section === 'playlists' ? playlists.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => openPlaylist(item)}><Artwork uri={item.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.stationName || item.owner?.displayName || 'By you'}</Text></View></Pressable>) : tracks.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => void openTrack(item)}><Artwork uri={item.coverArt} style={styles.rowArt} /><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{item.stationName || item.subtitle || item.artistName || 'Echoo Audio'}</Text></View><View style={styles.play}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View><AudioRowActions track={item} initialSaved={section === 'liked'} onChanged={() => void load(true)} /></Pressable>)}</View> : null}
  </ScrollView>
    <Modal visible={createOpen} animationType="slide" onRequestClose={() => { if (!creating) setCreateOpen(false); }}>
      <SafeAreaView style={styles.safeArea}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 20 }}>
          <Text style={styles.heading}>Create playlist</Text>
          <Text style={styles.rowSubtitle}>New playlists are private. You can change visibility in Manage playlist.</Text>
          <TextInput accessibilityLabel="Playlist name" placeholder="Playlist name" placeholderTextColor={palette.muted} value={playlistName} onChangeText={setPlaylistName} maxLength={120} autoFocus editable={!creating} style={styles.playlistInput} />
          {error ? <ListenerToast message={error} /> : null}
          <Pressable accessibilityRole="button" style={styles.createPlaylist} disabled={creating || !playlistName.trim()} onPress={() => void createPersonalPlaylist()}><Text style={styles.manageText}>{creating ? 'Creating…' : 'Create playlist'}</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.createPlaylist} disabled={creating} onPress={() => setCreateOpen(false)}><Text style={styles.manageText}>Cancel</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
const createThemeStyles = (palette: EchooColors) => StyleSheet.create({
  createPlaylist: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 24, marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.lineStrong, alignItems: 'center', justifyContent: 'center' },
  playlistInput: { minHeight: 52, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.lineStrong, color: palette.ink, backgroundColor: palette.surface, fontSize: 16 },
  safeArea: { flex: 1, backgroundColor: palette.background }, content: { paddingTop: 22, paddingBottom: 150 },
  skeletonInset: { marginHorizontal: 24 },
  gridGlyph: { width: 22, height: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }, gridTile: { width: 9.5, height: 9.5, borderRadius: 2, backgroundColor: palette.ink },
  listGlyph: { width: 24, height: 22, justifyContent: 'space-between' }, listBar: { width: 24, height: 5, borderRadius: 2, backgroundColor: palette.ink }, manageButton: { marginLeft: 'auto', minWidth: 82, height: 38, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, manageText: { color: palette.blue, fontFamily: 'DMSans_500Medium', fontSize: 14 }, manageHint: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 10 },
  downloadContent: { marginHorizontal: 24, marginTop: 20 }, downloadSummary: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 12 },
  downloadHeading: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 20, marginTop: 13, marginBottom: 12 }, downloadItem: { marginBottom: 13 }, downloadRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: palette.surfaceMuted, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: palette.blue }, retryLink: { alignSelf: 'flex-end', paddingVertical: 5 }, retryText: { color: palette.blue, fontFamily: 'DMSans_500Medium', fontSize: 13 },
  offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 9, backgroundColor: palette.blueSoft, padding: 13, marginVertical: 13 }, offlineText: { color: palette.blue, fontFamily: 'DMSans_400Regular', fontSize: 13, flex: 1 }, downloadEmpty: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13 },
  search: { height: 48, borderRadius: 25, backgroundColor: palette.surface, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 31 }, searchText: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 16, flexShrink: 1 },
  header: { marginTop: 15, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 5 }, back: { width: 26, justifyContent: 'center' }, heading: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.5 }, count: { alignSelf: 'flex-end', marginBottom: 3, color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 11 }, viewButton: { marginLeft: 'auto', width: 35, height: 35, alignItems: 'center', justifyContent: 'center' },
  grid: { marginHorizontal: 24, marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 31 }, artwork: { overflow: 'hidden', backgroundColor: palette.surfaceMuted }, gridTitle: { marginTop: 9, color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 16 }, gridSubtitle: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 2 },
  list: { marginHorizontal: 24, marginTop: 18, gap: 12 }, row: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowArt: { width: 62, height: 58, borderRadius: 5 }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 16 }, rowSubtitle: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 3 }, action: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' }, play: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
});
