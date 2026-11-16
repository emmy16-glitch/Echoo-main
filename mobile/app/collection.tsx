import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useLatestRequest } from '@/src/navigation/useLatestRequest';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import {
  ChevronLeft,
  Download,
  ListMusic,
  Music2,
  MoreVertical,
  Play,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeSessionChanges } from '@/src/services/sessionLifecycle';
import {
  Alert,
  Modal,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerEmptyState, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { CollectionSkeleton } from '@/src/components/DiscoverySkeletons';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { downloadAudioToDevice } from '@/src/services/localDownloads';
import { EchooAudio, EchooPlaylist, EchooPlaylistTrack, getPlaylistById, getCurrentUser, hasEchooSession, toggleSavedCollection, updatePersonalPlaylist, deletePersonalPlaylist, removePlaylistTrack, reorderPlaylistTracks } from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function CollectionScreen() {
  const { router, push } = useGuardedRouter();
  const { begin, invalidate } = useLatestRequest();
  const params = useLocalSearchParams<{
    collectionId?: string;
    stationId?: string;
    stationName?: string;
  }>();
  const collectionId = String(params.collectionId || '');
  const stationId = String(params.stationId || '');
  const stationName = String(params.stationName || '');
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const playback = usePlayback();
  // Collection details include account-specific saved state. Do not retain an
  // in-memory detail cache across sign-out or account switches.
  const [collection, setCollection] = useState<EchooPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState('');
  const [downloadNotice, setDownloadNotice] = useState('');
  const [viewerId, setViewerId] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState(false);
  const [trackToManage, setTrackToManage] = useState<EchooPlaylistTrack | null>(null);
  const canManage = collection?.mode === 'playlist' && Boolean(viewerId) && collection.owner?.id === viewerId;
  useEffect(() => subscribeSessionChanges(() => { invalidate(); setCollection(null); setViewerId(''); setEditing(false); setTrackToManage(null); setPlaylistBusy(false); setLoading(false); }), [invalidate]);

  const load = useCallback(async (force = false, silent = false) => {
    const active = begin();
    if (!collectionId) {
      setError('Collection ID is missing.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (force) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError('');
    try {
      const nextCollection = await getPlaylistById(collectionId, { force });
      if (!active()) return;
      setCollection(nextCollection);
      const session = await hasEchooSession();
      const viewer = session ? await getCurrentUser().catch(() => null) : null;
      if (active()) setViewerId(viewer?.id || '');
    } catch (loadError: any) {
      if (active()) setError(friendlyErrorMessage(loadError, 'Could not load this collection.'));
    } finally {
      if (active()) { setLoading(false); setRefreshing(false); }
    }
  }, [collectionId, begin]);

  useFocusEffect(useCallback(() => {
    setCollection(null);
    setViewerId(''); setEditing(false); setTrackToManage(null); setPlaylistBusy(false);
    void load(false);
    const unsubscribe = subscribeSessionChanges(() => { void load(false); });
    return () => { unsubscribe(); invalidate(); };
  }, [load, invalidate]));

  const openStation = () => {
    if (!stationId) return;
    push({ pathname: '/station', params: { stationId } });
  };

  const collectionQueue = useMemo<AudioPlaybackItem[]>(() => {
    if (!collection) return [];
    return collection.tracks.map((track) => ({
      kind: 'audio',
      id: track.id,
      title: track.title,
      subtitle: stationName || collection.owner?.displayName || 'Echoo Collection',
      coverArt: track.coverArt || collection.coverArt || '',
      fileUrl: track.fileUrl || '',
      genre: track.genre || '',
      stationId,
      stationName,
      collectionId: collection.id,
      collectionName: collection.name,
    }));
  }, [collection, stationId, stationName]);

  const openTrack = async (track: EchooPlaylistTrack) => {
    if (!collection) return;
    const startIndex = Math.max(0, collectionQueue.findIndex((item) => item.id === track.id));
    void playback.playAudioQueue(collectionQueue, startIndex).catch(() => undefined);
    push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: stationName || collection.owner?.displayName || 'Echoo Collection',
        coverArt: track.coverArt || collection.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
        stationId,
        stationName,
        collectionId: collection.id,
        collectionName: collection.name,
      },
    });
  };

  const playFirst = () => {
    const firstTrack = collection?.tracks[0];
    if (firstTrack) void openTrack(firstTrack);
  };

  const changePlaylist = async (action: () => Promise<EchooPlaylist | void>) => {
    if (!canManage || playlistBusy) return;
    const active = begin();
    setPlaylistBusy(true); setSaveError('');
    try {
      const updated = await action();
      if (!active()) return;
      if (updated) setCollection(updated);
      else router.replace({ pathname: '/library-section', params: { section: 'playlists' } });
      setEditing(false);
    } catch (cause) { if (active()) setSaveError(friendlyErrorMessage(cause, 'Could not update this playlist.')); }
    finally { if (active()) setPlaylistBusy(false); }
  };

  const moveManagedTrack = (offset: number) => {
    const track = trackToManage;
    if (!track || !collection || !canManage || playlistBusy) return;
    const index = collection.tracks.findIndex((item) => item.id === track.id);
    if (index < 0 || index + offset < 0 || index + offset >= collection.tracks.length) return;
    const ids = collection.tracks.map((item) => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    setTrackToManage(null);
    void changePlaylist(() => reorderPlaylistTracks(collection.id, ids));
  };

  const toAudioTrack = (track: EchooPlaylistTrack): EchooAudio => ({
    id: track.id,
    title: track.title,
    subtitle: stationName || collection?.owner?.displayName || 'Echoo Collection',
    artistName: stationName || collection?.owner?.displayName || 'Echoo',
    stationId,
    stationName,
    coverArt: track.coverArt || collection?.coverArt || '',
    fileUrl: track.fileUrl || '',
    genre: track.genre || '',
    duration: track.duration || 0,
  });

  const isSeries = collection?.mode === 'series';
  const toggleSave = async () => {
    if (!isSeries || !collection || saving) return;
    if (!(await hasEchooSession())) {
      router.push('/auth');
      return;
    }
    const nextSaved = !collection.isSaved;
    setSaving(true);
    setSaveError('');
    try {
      await toggleSavedCollection(collection.id, nextSaved);
      const updated = { ...collection, isSaved: nextSaved };
      setCollection(updated);
    } catch (saveFailure: any) {
      setSaveError(friendlyErrorMessage(saveFailure, 'Could not update saved Collections.'));
    } finally {
      setSaving(false);
    }
  };

  const downloadTracks = async (tracks: EchooPlaylistTrack[]) => {
    if (!tracks.length || downloadBusy) return;
    if (!(await hasEchooSession())) { push('/auth'); return; }
    setDownloadNotice('');
    let completed = 0;
    for (const track of tracks) {
      setDownloadBusy(track.id);
      try {
        await downloadAudioToDevice(toAudioTrack(track));
        completed += 1;
      } catch (downloadError: any) {
        setDownloadNotice(friendlyErrorMessage(downloadError, `Could not download ${track.title}.`));
        break;
      }
    }
    setDownloadBusy('');
    if (completed === tracks.length) setDownloadNotice(completed === 1 ? 'Audio saved for offline listening.' : `${completed} audio items saved for offline listening.`);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
      >
        <View style={styles.nav}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ChevronLeft color={palette.ink} size={26} />
          </Pressable>
          <Text style={styles.navTitle}>{collection?.mode === 'playlist' ? 'Your playlist' : 'Collection'}</Text>
        </View>

        {loading ? <CollectionSkeleton /> : null}

        {!loading && error ? (
          <>
            <ListenerToast message={error} />
            <ListenerEmptyState
              title="Collection unavailable"
              subtitle="Pull down to refresh or try again."
              action="Try again"
              onAction={() => load(true)}
              icon={<ListMusic color={palette.blue} size={25} />}
            />
          </>
        ) : null}

        {!loading && collection ? (
          <>
            <View style={styles.hero}>
              <View style={styles.cover}>
                {collection.coverArt ? (
                  <Image source={{ uri: collection.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <LinearGradient colors={[palette.blueDeep, palette.blue]} style={StyleSheet.absoluteFillObject} />
                )}
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.title} numberOfLines={3}>{collection.name}</Text>
                <Pressable disabled={!stationId} onPress={openStation}>
                  <Text style={styles.stationLink} numberOfLines={2}>{stationName || collection.stationName || collection.owner?.displayName || 'Echoo Station'}</Text>
                </Pressable>
                <Text style={styles.meta}>{collection.trackCount ?? collection.tracks.length} episodes</Text>
              </View>
            </View>
            {collection.description ? <Text style={styles.description}>{collection.description}</Text> : null}
            {canManage ? <Pressable style={styles.saveCollection} disabled={playlistBusy} onPress={() => { setEditName(collection.name); setEditDescription(collection.description || ''); setEditPublic(Boolean(collection.isPublic)); setEditing(true); }} accessibilityRole="button"><Text style={styles.saveCollectionText}>{playlistBusy ? 'Updating…' : 'Manage playlist'}</Text></Pressable> : null}
            {isSeries ? <Pressable style={styles.saveCollection} disabled={saving} onPress={toggleSave} accessibilityRole="button" accessibilityLabel={collection.isSaved ? 'Remove saved Collection' : 'Save Collection'}><Text style={styles.saveCollectionText}>{saving ? 'Saving…' : collection.isSaved ? 'Saved Collection' : 'Save Collection'}</Text></Pressable> : null}
            {saveError ? <ListenerToast message={saveError} /> : null}
            {downloadNotice ? <ListenerToast message={downloadNotice} /> : null}
            <View style={styles.actions}>
              <Pressable style={[styles.playButton, !collection.tracks.length && styles.playButtonDisabled]} disabled={!collection.tracks.length} onPress={playFirst}>
                <Text style={styles.playButtonText}>Play all</Text>
              </Pressable>
              <Pressable style={[styles.downloadAll, (!collection.tracks.length || Boolean(downloadBusy)) && styles.playButtonDisabled]} disabled={!collection.tracks.length || Boolean(downloadBusy)} onPress={() => void downloadTracks(collection.tracks)}>
                <Text style={styles.downloadAllText}>{downloadBusy ? 'Downloading…' : 'Download all'}</Text>
              </Pressable>
            </View>

            <View style={styles.trackList}>
              {collection.tracks.length ? (
                collection.tracks.map((track) => (
                  <Pressable
                    key={track.id}
                    style={styles.trackRow}
                    onPress={() => openTrack(track)}
                  >
                    <View style={styles.trackArt}>
                      {track.coverArt || collection.coverArt ? (
                        <Image source={{ uri: track.coverArt || collection.coverArt || '' }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      ) : (
                        <Music2 color={palette.blue} size={20} />
                      )}
                    </View>
                    <View style={styles.trackCopy}>
                      <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.trackMeta} numberOfLines={1}>{stationName || collection.stationName || collection.owner?.displayName || 'Echoo Audio'}</Text>
                    </View>
                    <View style={styles.trackPlay}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View>
                    {canManage ? <Pressable style={styles.trackDownload} disabled={playlistBusy} onPress={(event) => { event.stopPropagation(); setTrackToManage(track); }} accessibilityLabel={`Manage ${track.title}`}><MoreVertical color={palette.ink} size={23} /></Pressable> : null}
                    <Pressable style={styles.trackDownload} disabled={Boolean(downloadBusy)} onPress={(event) => { event.stopPropagation(); void downloadTracks([track]); }} accessibilityLabel={`Download ${track.title}`}>
                      {downloadBusy === track.id ? <Text style={styles.downloadBusy}>…</Text> : <Download color={palette.ink} size={23} />}
                    </Pressable>
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyRow}>
                  <ListMusic color={palette.blue} size={22} />
                  <Text style={styles.emptyText}>No public items in this collection yet.</Text>
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
      <Modal visible={editing && Boolean(canManage)} animationType="slide" onRequestClose={() => { if (!playlistBusy) setEditing(false); }}>
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editForm}>
              <Text style={styles.navTitle}>Manage playlist</Text>
              <Text style={styles.editLabel}>Name</Text>
              <TextInput accessibilityLabel="Playlist name" style={styles.editInput} value={editName} onChangeText={setEditName} maxLength={120} editable={!playlistBusy} placeholderTextColor={palette.muted} />
              <Text style={styles.editLabel}>Description</Text>
              <TextInput accessibilityLabel="Playlist description" style={[styles.editInput, { minHeight: 96, textAlignVertical: 'top' }]} multiline value={editDescription} onChangeText={setEditDescription} maxLength={2000} editable={!playlistBusy} placeholderTextColor={palette.muted} />
              <View style={styles.editPrivacy}><Text style={styles.editLabel}>Public playlist</Text><Switch value={editPublic} onValueChange={setEditPublic} disabled={playlistBusy} trackColor={{ true: palette.blue }} /></View>
              <Text style={styles.description}>{editPublic ? 'Others can discover and listen to this playlist.' : 'Only you can access this playlist.'}</Text>
              {saveError ? <ListenerToast message={saveError} /> : null}
              <Pressable accessibilityRole="button" style={styles.editSave} disabled={playlistBusy || !editName.trim()} onPress={() => collection && void changePlaylist(() => updatePersonalPlaylist(collection.id, { name: editName.trim(), description: editDescription.trim(), isPublic: editPublic }))}><Text style={styles.playButtonText}>{playlistBusy ? 'Saving…' : 'Save changes'}</Text></Pressable>
              <Pressable accessibilityRole="button" style={styles.editAction} disabled={playlistBusy} onPress={() => setEditing(false)}><Text style={styles.saveCollectionText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" style={styles.editAction} disabled={playlistBusy} onPress={() => Alert.alert('Delete playlist?', 'This removes the playlist. The original audio and downloaded files are kept.', [
                { text: 'Cancel', style: 'cancel' }, { text: 'Delete playlist', style: 'destructive', onPress: () => collection && void changePlaylist(() => deletePersonalPlaylist(collection.id)) },
              ])}><Text style={[styles.saveCollectionText, { color: palette.red }]}>Delete playlist</Text></Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal transparent visible={Boolean(trackToManage && canManage)} animationType="slide" onRequestClose={() => setTrackToManage(null)}>
        <View style={styles.trackMenuBackdrop}><SafeAreaView style={styles.trackMenuSheet}>
          <Text style={styles.title}>{trackToManage?.title}</Text>
          {trackToManage && collection && collection.tracks.findIndex((item) => item.id === trackToManage.id) > 0 ? <Pressable style={styles.editAction} onPress={() => moveManagedTrack(-1)}><Text style={styles.saveCollectionText}>Move up</Text></Pressable> : null}
          {trackToManage && collection && collection.tracks.findIndex((item) => item.id === trackToManage.id) < collection.tracks.length - 1 ? <Pressable style={styles.editAction} onPress={() => moveManagedTrack(1)}><Text style={styles.saveCollectionText}>Move down</Text></Pressable> : null}
          <Pressable style={styles.editAction} onPress={() => {
            const track = trackToManage;
            setTrackToManage(null);
            if (track && collection) Alert.alert('Remove track?', 'This removes it from this playlist only.', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void changePlaylist(() => removePlaylistTrack(collection.id, track.id)) },
            ]);
          }}><Text style={[styles.saveCollectionText, { color: palette.red }]}>Remove from playlist</Text></Pressable>
          <Pressable style={styles.editAction} onPress={() => setTrackToManage(null)}><Text style={styles.saveCollectionText}>Cancel</Text></Pressable>
        </SafeAreaView></View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  trackMenuBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  trackMenuSheet: { backgroundColor: palette.surfaceRaised, padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  editForm: { padding: 24, gap: 12, paddingBottom: 48 },
  editLabel: { color: palette.ink, fontSize: 15, fontFamily: 'DMSans_500Medium', marginTop: 8 },
  editInput: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surface, color: palette.ink, padding: 14, fontSize: 16 },
  editPrivacy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  editSave: { minHeight: 52, borderRadius: 16, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  editAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 140 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 26, height: 42, alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.7 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 49 },
  cover: { width: '46%', aspectRatio: 1.08, borderRadius: 20, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  heroCopy: { flex: 1, minWidth: 0 },
  title: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 29, letterSpacing: -0.6 },
  stationLink: { color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 12 },
  meta: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 10 },
  description: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, marginTop: 15 },
  saveCollection: { marginTop: 10, paddingHorizontal: 14, minHeight: 34, alignSelf: 'flex-start', borderColor: palette.blue, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  saveCollectionText: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 22, marginTop: 22, marginBottom: 14 },
  playButton: { flex: 1, height: 45, borderRadius: 23, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  downloadAll: { flex: 1, height: 45, borderRadius: 23, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  playButtonDisabled: { opacity: 0.55 },
  playButtonText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  downloadAllText: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 15 },
  trackList: { gap: 6 },
  trackRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  trackArt: { width: 68, height: 58, borderRadius: 5, backgroundColor: palette.surfaceMuted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  trackCopy: { flex: 1, minWidth: 0 },
  trackTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 15 },
  trackMeta: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  trackPlay: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  trackDownload: { width: 35, height: 40, alignItems: 'center', justifyContent: 'center' },
  downloadBusy: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 17 },
  emptyRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  emptyText: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, flex: 1 },
});
