import { useEffect, useState } from 'react';
import { Radio, Users } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppTopBar,
  EmptyState,
  FeaturedPlayer,
  HorizontalRail,
  ListRow,
  MediaCard,
  MiniPlayer,
  SearchPill,
  Screen,
  Section,
} from '@/src/components/EchooMobile';
import { EchooBroadcast, getMobileDiscovery } from '@/src/services/echooApi';
import { colors, radius } from '@/src/theme/echooTheme';

export default function LiveScreen() {
  const [live, setLive] = useState<EchooBroadcast[]>([]);
  const [scheduled, setScheduled] = useState<EchooBroadcast[]>([]);

  useEffect(() => {
    let active = true;
    getMobileDiscovery().then((data) => {
      if (!active) return;
      setLive(data.live);
      setScheduled(data.scheduled);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const featured = live[0];

  return (
    <Screen>
      <AppTopBar title="Live" subtitle="On-air stations" />
      <SearchPill placeholder="Search live rooms" />

      <FeaturedPlayer
        title={featured?.title || 'No live room yet'}
        subtitle={featured ? `${featured.stationName} is broadcasting now` : 'Scheduled shows move here when creators go live'}
        badge={featured ? 'LIVE' : 'QUIET'}
        image={featured?.coverArt}
      />

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Radio color={colors.red} size={20} />
          <Text style={styles.statValue}>{live.length}</Text>
          <Text style={styles.statLabel}>Live rooms</Text>
        </View>
        <View style={styles.stat}>
          <Users color={colors.blue} size={20} />
          <Text style={styles.statValue}>{live.reduce((sum, item) => sum + (item.listenerCount || 0), 0)}</Text>
          <Text style={styles.statLabel}>Listening now</Text>
        </View>
      </View>

      <Section title="On air">
        {live.length ? (
          <>
            <HorizontalRail>
              {live.map((item) => (
                <MediaCard key={item.id} title={item.title} subtitle={item.stationName} image={item.coverArt} live wide />
              ))}
            </HorizontalRail>
            {live.slice(0, 3).map((item) => (
              <ListRow
                key={`row-${item.id}`}
                title={item.title}
                subtitle={item.stationName || 'Echoo Station'}
                meta={`${item.listenerCount || 0} live`}
                image={item.coverArt}
              />
            ))}
          </>
        ) : <EmptyState title="No live broadcasts" subtitle="Live rooms will appear the moment creators start broadcasting." />}
      </Section>

      <Section title="Starting soon">
        {scheduled.length ? scheduled.slice(0, 6).map((item) => (
          <ListRow
            key={item.id}
            title={item.title}
            subtitle={item.stationName || 'Echoo Station'}
            meta={item.startTime ? new Date(item.startTime).toLocaleDateString() : 'Scheduled'}
            image={item.coverArt}
          />
        )) : <EmptyState title="Nothing scheduled yet" subtitle="Upcoming broadcasts will keep listeners ready before a room opens." />}
      </Section>

      <MiniPlayer
        title={featured?.title || 'Live preview'}
        subtitle={featured?.stationName || 'Echoo live'}
        image={featured?.coverArt}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 6 },
  statValue: { color: colors.ink, fontSize: 26, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});
