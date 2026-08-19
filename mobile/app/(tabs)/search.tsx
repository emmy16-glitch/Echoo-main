import { useEffect, useState } from 'react';
import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppTopBar, EmptyState, ListRow, MiniPlayer, Screen, Section } from '@/src/components/EchooMobile';
import { EchooAudio, EchooBroadcast, EchooStation, searchEchoo } from '@/src/services/echooApi';
import { colors, radius } from '@/src/theme/echooTheme';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [audio, setAudio] = useState<EchooAudio[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [live, setLive] = useState<EchooBroadcast[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchEchoo(query).then((results) => {
        setAudio(results.audio);
        setStations(results.stations);
        setLive(results.live);
      }).catch(() => {
        setAudio([]);
        setStations([]);
        setLive([]);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Screen>
      <AppTopBar title="Search" subtitle="Find your sound" />

      <View style={styles.searchBox}>
        <Search color={colors.muted} size={20} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Echoo"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
      </View>

      {!query.trim() ? <EmptyState title="Search Echoo" subtitle="Try a creator, station, playlist or audio title." /> : null}

      <Section title="Live and broadcasts">
        {live.length ? live.map((item) => (
          <ListRow key={item.id} title={item.title} subtitle={item.stationName} meta={item.status || 'Broadcast'} image={item.coverArt} />
        )) : <EmptyState title="No broadcasts found" subtitle="Try another title or station name." />}
      </Section>

      <Section title="Audio">
        {audio.length ? audio.map((item) => (
          <ListRow key={item.id} title={item.title} subtitle={item.subtitle} meta={item.genre || 'Audio'} image={item.coverArt} />
        )) : <EmptyState title="No audio found" subtitle="Published creator audio will appear here." />}
      </Section>

      <Section title="Stations">
        {stations.length ? stations.map((item) => (
          <ListRow key={item.id} title={item.name} subtitle={item.category || 'Station'} meta={`${item.followerCount || 0} followers`} image={item.coverArt} />
        )) : <EmptyState title="No stations found" subtitle="Stations are creator channels and live homes." />}
      </Section>

      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' },
});
