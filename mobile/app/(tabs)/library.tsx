import { Download, Heart, History, ListMusic } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { AppTopBar, EmptyState, HorizontalRail, ListRow, MediaCard, MiniPlayer, PlaylistChip, Screen, Section } from '@/src/components/EchooMobile';
import { colors, radius } from '@/src/theme/echooTheme';

const libraryTiles = [
  { title: 'Saved audio', subtitle: 'Songs, podcasts and recordings', icon: Heart },
  { title: 'Playlists', subtitle: 'Personal collections', icon: ListMusic },
  { title: 'History', subtitle: 'Recently played', icon: History },
  { title: 'Downloads', subtitle: 'Offline on this phone', icon: Download },
];

export default function LibraryScreen() {
  return (
    <Screen>
      <AppTopBar title="Library" subtitle="Saved audio" />

      <HorizontalRail>
        <PlaylistChip title="Liked" />
        <PlaylistChip title="Downloads" tone="#173b9c" />
        <PlaylistChip title="History" tone="#e5484d" />
        <PlaylistChip title="Stations" tone="#12b76a" />
      </HorizontalRail>

      <View style={styles.grid}>
        {libraryTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <View key={tile.title} style={styles.tile}>
              <Icon color={colors.blue} size={24} />
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
            </View>
          );
        })}
      </View>

      <Section title="Recently played" action="History">
        <HorizontalRail>
          <MediaCard title="No history yet" subtitle="Start listening" />
          <MediaCard title="Live replays" subtitle="Coming soon" />
          <MediaCard title="Saved shows" subtitle="Your queue" />
        </HorizontalRail>
      </Section>

      <Section title="Your playlists">
        <ListRow title="Faith & Spirituality" subtitle="Curated station mix" meta="Playlist" />
        <ListRow title="Creator teachings" subtitle="Saved audio queue" meta="Playlist" />
        <EmptyState title="Create playlists from audio" subtitle="Music, podcasts and station shows can live together in the same mobile collection." />
      </Section>

      <MiniPlayer title="Saved audio" subtitle="Your collection" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '48%', minHeight: 132, backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8 },
  tileTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  tileSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
