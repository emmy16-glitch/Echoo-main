import { Mic, Radio, Upload, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTopBar, FeaturedPlayer, HorizontalRail, ListRow, MediaCard, Screen, Section } from '@/src/components/EchooMobile';
import { colors, radius, shadow } from '@/src/theme/echooTheme';

const actions = [
  { title: 'Go live', subtitle: 'Start a mobile broadcast', icon: Mic, tone: colors.red },
  { title: 'Stations', subtitle: 'Manage creator channels', icon: Radio, tone: colors.blue },
  { title: 'Upload', subtitle: 'Publish audio', icon: Upload, tone: colors.green },
  { title: 'Audience', subtitle: 'Followers and listeners', icon: Users, tone: colors.amber },
];

export default function CreatorScreen() {
  return (
    <Screen>
      <AppTopBar title="Creator" subtitle="Pocket studio" />

      <FeaturedPlayer
        title="Go live from phone"
        subtitle="Choose a station, test the mic, open a LiveKit room and talk to listeners."
        badge="CREATOR"
      />

      <View style={styles.actions}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Pressable key={action.title} style={styles.action}>
              <View style={[styles.actionIcon, { backgroundColor: `${action.tone}18` }]}>
                <Icon color={action.tone} size={24} />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </Pressable>
          );
        })}
      </View>

      <Section title="Creator stations" action="Manage">
        <HorizontalRail>
          <MediaCard title="Main station" subtitle="Live home" wide />
          <MediaCard title="Podcast channel" subtitle="Audio series" wide />
        </HorizontalRail>
      </Section>

      <Section title="Go-live flow">
        <ListRow title="1. Select station" subtitle="Broadcasts always belong to a station" meta="Setup" />
        <ListRow title="2. Add title" subtitle="What listeners see in Live" meta="Setup" />
        <ListRow title="3. Test microphone" subtitle="Meter and permission check" meta="Audio" />
        <ListRow title="4. Start room" subtitle="Publish creator audio to LiveKit" meta="Live" />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: { width: '48%', minHeight: 144, backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8, ...shadow },
  actionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  actionSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
