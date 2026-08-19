import { Bell, LogOut, Settings, Shield, UserRound } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { AppTopBar, ListRow, MiniPlayer, Screen, Section } from '@/src/components/EchooMobile';
import { colors, radius } from '@/src/theme/echooTheme';

const profileItems = [
  { title: 'Account', subtitle: 'Profile, username and avatar', icon: UserRound },
  { title: 'Notifications', subtitle: 'Live and creator updates', icon: Bell },
  { title: 'Settings', subtitle: 'Playback, privacy and app preferences', icon: Settings },
  { title: 'Privacy', subtitle: 'Control your Echoo experience', icon: Shield },
  { title: 'Log out', subtitle: 'Leave this device', icon: LogOut },
];

export default function ProfileScreen() {
  return (
    <Screen>
      <AppTopBar title="Profile" subtitle="Your Echoo" />

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>E</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.name}>Echoo Listener</Text>
          <Text style={styles.handle}>Switch between listening and creator mode</Text>
        </View>
      </View>

      <Section title="Account">
        {profileItems.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.title} style={styles.item}>
              <Icon color={item.title === 'Log out' ? colors.red : colors.blue} size={20} />
              <ListRow title={item.title} subtitle={item.subtitle} />
            </View>
          );
        })}
      </Section>

      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: { backgroundColor: colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  profileCopy: { flex: 1, gap: 4 },
  name: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  handle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, paddingLeft: 12 },
});
