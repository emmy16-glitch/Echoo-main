import { useRouter } from 'expo-router';
import {
  Bell,
  BellRing,
  CheckCheck,
  Heart,
  Megaphone,
  MessageCircleMore,
  Music2,
  Radio,
  Trash2,
  UserPlus,
} from 'lucide-react-native';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ListenerAuthCard,
  ListenerBackHeader,
  ListenerEmptyState,
  ListenerPageHeader,
} from '@/src/components/ListenerV2';
import { hasEchooSession } from '@/src/services/echooApi';
import {
  deleteNotification,
  EchooNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/src/services/notificationService';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function NotificationsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<EchooNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const session = await hasEchooSession();
    setSignedIn(session);

    if (!session) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const page = await getNotifications(75);
      setNotifications(page.notifications);
      setUnreadCount(page.unreadCount);
    } catch (loadError: any) {
      if (loadError?.code === 'AUTH_REQUIRED' || loadError?.status === 401) {
        setSignedIn(false);
      } else {
        setError(loadError?.message || 'Could not load notifications.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    if (!unreadCount || markingAll) return;
    setMarkingAll(true);
    setError('');
    try {
      await markAllNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (markError: any) {
      setError(markError?.message || 'Could not mark notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = async (notification: EchooNotification) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
        setNotifications((items) =>
          items.map((item) => item.id === notification.id ? { ...item, read: true } : item)
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // Reading the notification content should still be possible if marking fails.
      }
    }

    const stationId = getMetadataString(notification.metadata, 'stationId');
    const broadcastId = getMetadataString(notification.metadata, 'broadcastId');
    const audioId = getMetadataString(notification.metadata, 'audioId');

    if (stationId) {
      router.push({ pathname: '/station', params: { stationId } });
      return;
    }
    if (broadcastId) {
      router.push('/live');
      return;
    }
    if (audioId) {
      router.push({ pathname: '/search', params: { q: notification.title } });
    }
  };

  const removeNotification = async (notificationId: string) => {
    setError('');
    try {
      const target = notifications.find((item) => item.id === notificationId);
      await deleteNotification(notificationId);
      setNotifications((items) => items.filter((item) => item.id !== notificationId));
      if (target && !target.read) setUnreadCount((count) => Math.max(0, count - 1));
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Could not remove this notification.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerBackHeader title="Notifications" />
        <ListenerPageHeader
          eyebrow="UPDATES"
          title="Your Echoo alerts"
          subtitle="Live announcements, creator releases, follows and other account activity."
        />

        {!signedIn && !loading ? (
          <ListenerAuthCard
            title="Sign in to see notifications"
            subtitle="Echoo notifications belong to your account and stay private to you."
            onPress={() => router.push('/auth')}
          />
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : null}

        {signedIn && !loading ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Bell color={palette.muted} size={20} strokeWidth={2} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryValue}>{unreadCount}</Text>
                <Text style={styles.summaryLabel}>{unreadCount === 1 ? 'unread notification' : 'unread notifications'}</Text>
              </View>
              {unreadCount ? (
                <Pressable style={styles.readAllButton} onPress={markAll} disabled={markingAll}>
                  {markingAll ? (
                    <ActivityIndicator color={palette.blue} size="small" />
                  ) : (
                    <CheckCheck color={palette.blue} size={18} />
                  )}
                  <Text style={styles.readAllText}>Read all</Text>
                </Pressable>
              ) : null}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {notifications.length ? (
              <View style={styles.notificationList}>
                {notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    palette={palette}
                    onPress={() => openNotification(notification)}
                    onDelete={() => removeNotification(notification.id)}
                  />
                ))}
              </View>
            ) : (
              <ListenerEmptyState
                title="You are all caught up"
                subtitle="New Echoo account notifications will appear here when there is something relevant to you."
                icon={<Bell color={palette.muted} size={22} strokeWidth={2} />}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NotificationRow({
  notification,
  palette,
  onPress,
  onDelete,
}: {
  notification: EchooNotification;
  palette: EchooColors;
  onPress: () => void;
  onDelete: () => void;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const icon = notificationIcon(notification.type, palette);

  return (
    <View style={[styles.notificationRow, !notification.read && styles.notificationUnread]}>
      <Pressable style={styles.notificationMain} onPress={onPress}>
        <View style={styles.notificationIcon}>{icon}</View>
        <View style={styles.notificationCopy}>
          <View style={styles.notificationTitleLine}>
            <Text style={styles.notificationTitle} numberOfLines={1}>{notification.title}</Text>
            {!notification.read ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.notificationMessage} numberOfLines={2}>{notification.message}</Text>
          <Text style={styles.notificationTime}>{formatNotificationTime(notification.createdAt)}</Text>
        </View>
      </Pressable>
      <Pressable style={styles.deleteButton} onPress={onDelete} accessibilityLabel="Delete notification">
        <Trash2 color={palette.faint} size={17} />
      </Pressable>
    </View>
  );
}

function notificationIcon(type: string, palette: EchooColors): ReactNode {
  switch (type) {
    case 'broadcast_live':
    case 'broadcast_reminder':
    case 'broadcast_ended':
      return <Radio color={palette.muted} size={19} strokeWidth={2} />;
    case 'new_release':
      return <Music2 color={palette.muted} size={19} strokeWidth={2} />;
    case 'new_follower':
      return <UserPlus color={palette.muted} size={19} strokeWidth={2} />;
    case 'new_like':
      return <Heart color={palette.muted} size={19} strokeWidth={2} />;
    case 'new_comment':
      return <MessageCircleMore color={palette.muted} size={19} strokeWidth={2} />;
    case 'system_announcement':
      return <Megaphone color={palette.muted} size={19} strokeWidth={2} />;
    default:
      return <BellRing color={palette.muted} size={19} strokeWidth={2} />;
  }
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function formatNotificationTime(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 48 },
  loadingState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  summaryCard: { minHeight: 78, borderRadius: 19, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  summaryIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryValue: { color: palette.ink, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: palette.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  readAllButton: { minHeight: 39, borderRadius: 13, backgroundColor: palette.blueSoft, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  readAllText: { color: palette.blue, fontSize: 11, fontWeight: '900' },
  errorText: { color: palette.red, fontSize: 11.5, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  notificationList: { marginTop: 16, gap: 9 },
  notificationRow: { minHeight: 88, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  notificationUnread: { borderColor: `${palette.blue}55`, backgroundColor: palette.surfaceRaised },
  notificationMain: { flex: 1, minHeight: 88, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 14 },
  notificationIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1 },
  notificationTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notificationTitle: { flex: 1, color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.blue },
  notificationMessage: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  notificationTime: { color: palette.faint, fontSize: 9.8, fontWeight: '700', marginTop: 5 },
  deleteButton: { width: 42, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
});
