import {
  Check,
  Download,
  Heart,
  ListMusic,
  MapPin,
  MoreHorizontal,
  Plus,
  Share2,
} from 'lucide-react-native';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  EchooAudio,
  EchooPlaylist,
  addTrackToPlaylist,
  createPlaylist,
  getCachedMyPlaylistsSnapshot,
  getMyPlaylists,
  hasEchooSession,
  saveAudio,
  unsaveAudio,
} from '@/src/services/echooApi';
import {
  downloadAudioToDevice,
  getLocalDownloadStatusSnapshot,
  isAudioDownloaded,
  subscribeLocalDownloadStatus,
} from '@/src/services/localDownloads';
import { friendlyErrorMessage, useListenerPalette } from '@/src/components/ListenerV2';

type AudioRowActionsProps = {
  track: EchooAudio;
  initialSaved?: boolean;
  downloaded?: boolean;
  onChanged?: () => void;
};

export function AudioRowActions({
  track,
  initialSaved = false,
  downloaded = false,
  onChanged,
}: AudioRowActionsProps) {
  const { push } = useGuardedRouter();
  const palette = useListenerPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [isDownloaded, setIsDownloaded] = useState(downloaded);
  const [downloadProgress, setDownloadProgress] = useState(downloaded ? 100 : 0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('error');
  const [playlists, setPlaylists] = useState<EchooPlaylist[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const requireSession = async () => {
    const signedIn = await hasEchooSession();
    if (!signedIn) {
      setOpen(false);
      push('/auth');
      return false;
    }
    return true;
  };

  useEffect(() => {
    let active = true;
    setIsDownloaded(downloaded);
    setDownloadProgress(downloaded ? 100 : 0);

    isAudioDownloaded(track.id).then((exists) => {
      if (!active) return;
      if (exists) {
        setIsDownloaded(true);
        setDownloadProgress(100);
      }
    }).catch(() => undefined);

    const unsubscribe = subscribeLocalDownloadStatus(() => {
      const status = getLocalDownloadStatusSnapshot(track.id);
      if (!active) return;
      setDownloadProgress(status.progress);
      setIsDownloaded(status.status === 'completed');
      if (status.status === 'downloading') setBusy('download');
      if (status.status === 'completed' || status.status === 'failed') setBusy((current) => current === 'download' ? '' : current);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [downloaded, track.id]);

  const toggleSaved = async () => {
    if (!track.id || !(await requireSession())) return;
    setBusy('save');
    setMessage('');
    try {
      if (saved) {
        await unsaveAudio(track.id);
        setSaved(false);
        setMessageTone('info');
        setMessage('Removed from saved audio.');
      } else {
        await saveAudio(track.id);
        setSaved(true);
        setMessageTone('info');
        setMessage('Saved to your library.');
      }
      onChanged?.();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(friendlyErrorMessage(error, 'Could not update saved audio.'));
    } finally {
      setBusy('');
    }
  };

  const downloadTrack = async () => {
    if (!track.id || !(await requireSession())) return;
    setBusy('download');
    setDownloadProgress(1);
    setMessage('');
    try {
      await downloadAudioToDevice(track, setDownloadProgress);
      setIsDownloaded(true);
      setDownloadProgress(100);
      setMessageTone('info');
      setMessage('Downloaded for offline listening.');
      onChanged?.();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(friendlyErrorMessage(error, 'Could not download this audio.'));
    } finally {
      setBusy('');
    }
  };

  const openPlaylistPicker = async () => {
    if (!track.id || !(await requireSession())) return;
    setPlaylistOpen(true);
    setMessage('');

    const cachedPlaylists = await getCachedMyPlaylistsSnapshot().catch(() => []);
    if (cachedPlaylists.length) {
      setPlaylists(cachedPlaylists);
      setPlaylistLoading(false);
    } else {
      setPlaylistLoading(true);
      setBusy('playlist');
    }

    try {
      setPlaylists(await getMyPlaylists());
    } catch (error: any) {
      if (!cachedPlaylists.length) {
        setMessageTone('error');
        setMessage(friendlyErrorMessage(error, 'Could not load playlists.'));
      }
    } finally {
      setPlaylistLoading(false);
      setBusy('');
    }
  };

  const addToPlaylist = async (playlist: EchooPlaylist) => {
    if (!track.id) return;
    setBusy(playlist.id);
    setMessage('');
    try {
      await addTrackToPlaylist(playlist.id, track.id);
      setPlaylistOpen(false);
      setMessageTone('info');
      setMessage(`Added to ${playlist.name}.`);
      onChanged?.();
    } catch (error: any) {
      if (error?.code === 'TRACK_ALREADY_IN_PLAYLIST') {
        setPlaylistOpen(false);
        setMessageTone('info');
        setMessage('Already in this playlist.');
      } else {
        setMessageTone('error');
        setMessage(friendlyErrorMessage(error, 'Could not add this audio.'));
      }
    } finally {
      setBusy('');
    }
  };

  const createAndAddPlaylist = async () => {
    const cleanName = newPlaylistName.trim();
    if (!track.id || !cleanName) return;
    setBusy('new');
    setMessage('');
    try {
      const playlist = await createPlaylist({ name: cleanName });
      await addTrackToPlaylist(playlist.id, track.id);
      setNewPlaylistName('');
      setPlaylistOpen(false);
      setMessageTone('info');
      setMessage(`Added to ${playlist.name}.`);
      onChanged?.();
    } catch (error: any) {
      setMessageTone('error');
      setMessage(friendlyErrorMessage(error, 'Could not create playlist.'));
    } finally {
      setBusy('');
    }
  };

  const shareTrack = async () => {
    await Share.share({ message: `${track.title} - ${track.stationName || track.artistName || 'Echoo'} on Echoo` });
  };

  const openStation = () => {
    if (!track.stationId) return;
    setOpen(false);
    push({ pathname: '/station', params: { stationId: track.stationId } });
  };

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityLabel={`More actions for ${track.title}`}
      >
        <MoreHorizontal color={palette.muted} size={20} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {track.stationName || track.subtitle || track.artistName || 'Echoo Audio'}
            </Text>

            <ActionRow
              icon={<Heart color={saved ? palette.red : palette.ink} fill={saved ? palette.red : 'transparent'} size={20} />}
              label={saved ? 'Remove from saved audio' : 'Save audio'}
              busy={busy === 'save'}
              onPress={toggleSaved}
              styles={styles}
            />
            <ActionRow
              icon={isDownloaded ? <Check color={palette.blue} size={20} /> : <Download color={palette.ink} size={20} />}
              label={
                isDownloaded
                  ? 'Downloaded on this device'
                  : busy === 'download'
                    ? `Downloading ${downloadProgress}%`
                    : 'Download for offline'
              }
              busy={busy === 'download'}
              onPress={downloadTrack}
              styles={styles}
              progress={busy === 'download' ? downloadProgress : undefined}
            />
            <ActionRow
              icon={<ListMusic color={palette.ink} size={20} />}
              label="Add to playlist"
              busy={busy === 'playlist'}
              onPress={openPlaylistPicker}
              styles={styles}
            />
            <ActionRow
              icon={<Share2 color={palette.ink} size={20} />}
              label="Share"
              onPress={shareTrack}
              styles={styles}
            />
            {track.stationId ? (
              <ActionRow
                icon={<MapPin color={palette.ink} size={20} />}
                label="Open station"
                onPress={openStation}
                styles={styles}
              />
            ) : null}

            {playlistOpen ? (
              <View style={styles.playlistPanel}>
                <View style={styles.newPlaylistRow}>
                  <TextInput
                    value={newPlaylistName}
                    onChangeText={setNewPlaylistName}
                    placeholder="New playlist name"
                    placeholderTextColor={palette.faint}
                    style={styles.input}
                  />
                  <Pressable
                    style={[styles.createButton, !newPlaylistName.trim() && styles.disabled]}
                    onPress={createAndAddPlaylist}
                    disabled={!newPlaylistName.trim() || busy === 'new'}
                  >
                    {busy === 'new' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Plus color="#FFFFFF" size={19} />}
                  </Pressable>
                </View>
                {playlistLoading ? (
                  <View style={styles.playlistLoadingRow}>
                    <ActivityIndicator color={palette.blue} size="small" />
                    <Text style={styles.mutedText}>Loading playlists...</Text>
                  </View>
                ) : playlists.length ? playlists.map((playlist) => (
                  <Pressable key={playlist.id} style={styles.playlistRow} onPress={() => addToPlaylist(playlist)}>
                    <View style={styles.playlistIcon}>
                      <ListMusic color={palette.blue} size={18} />
                    </View>
                    <View style={styles.playlistCopy}>
                      <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
                      <Text style={styles.playlistMeta}>{playlist.trackCount || playlist.tracks.length} tracks</Text>
                    </View>
                    {busy === playlist.id ? <ActivityIndicator color={palette.blue} size="small" /> : null}
                  </Pressable>
                )) : (
                  <Text style={styles.mutedText}>Create a playlist above.</Text>
                )}
              </View>
            ) : null}

            {message ? (
              <Text style={[styles.message, messageTone === 'info' && styles.messageInfo]}>
                {message}
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ActionRow({
  icon,
  label,
  busy,
  onPress,
  styles,
  progress,
}: {
  icon: ReactNode;
  label: string;
  busy?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  progress?: number;
}) {
  return (
    <Pressable style={styles.actionRow} onPress={onPress} disabled={busy}>
      <View style={styles.actionIcon}>{busy ? <ActivityIndicator size="small" /> : icon}</View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionText}>{label}</Text>
        {progress !== undefined ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(1, Math.min(100, progress))}%` }]} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (palette: ReturnType<typeof useListenerPalette>) => StyleSheet.create({
  trigger: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: palette.lineStrong, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  sheetSubtitle: { color: palette.muted, fontSize: 12, marginTop: 3, marginBottom: 12 },
  actionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: palette.line },
  actionIcon: { width: 28, alignItems: 'center' },
  actionCopy: { flex: 1, minWidth: 0 },
  actionText: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.surfaceMuted, marginTop: 7, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.blue },
  playlistPanel: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12, marginTop: 4 },
  playlistLoadingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 },
  newPlaylistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  input: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    color: palette.ink,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
  },
  createButton: { width: 46, height: 46, borderRadius: 8, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  playlistRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 },
  playlistIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  playlistCopy: { flex: 1 },
  playlistName: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  playlistMeta: { color: palette.muted, fontSize: 11, marginTop: 2 },
  mutedText: { color: palette.muted, fontSize: 12, paddingVertical: 12 },
  message: { color: palette.red, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  messageInfo: { color: palette.blue },
});
