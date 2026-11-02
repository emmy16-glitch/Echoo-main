import { useRouter } from 'expo-router';
import { MessageCircle, Send, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Socket } from 'socket.io-client';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EchooChatMessage,
  getPublicLiveChatMessages,
  hasEchooSession,
  sendLiveChatMessage,
} from '@/src/services/echooApi';
import { joinLiveChat, leaveLiveChat } from '@/src/services/liveChatRealtime';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type Props = {
  visible: boolean;
  broadcastId: string;
  title: string;
  onClose: () => void;
};

function mergeMessage(messages: EchooChatMessage[], incoming: EchooChatMessage) {
  if (!incoming.id) return messages;
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index < 0) return [...messages, incoming];
  const next = [...messages];
  next[index] = { ...next[index], ...incoming };
  return next;
}

function formatTime(value?: string | null) {
  if (!value) return 'Now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LiveChatSheet({ visible, broadcastId, title, onClose }: Props) {
  const router = useRouter();
  const palette = getEchooColors(useColorScheme());
  const styles = useMemo(() => createStyles(palette), [palette]);
  const listRef = useRef<FlatList<EchooChatMessage>>(null);
  const [messages, setMessages] = useState<EchooChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    if (!broadcastId) return;
    setLoading(true);
    try {
      const rows = await getPublicLiveChatMessages(broadcastId);
      setMessages((current) => rows.reduce(mergeMessage, current));
      setError('');
    } catch (loadError: any) {
      setError(loadError?.message || 'Live chat is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    if (!visible) return;
    void hasEchooSession().then(setSignedIn).catch(() => setSignedIn(false));
    void loadHistory();
  }, [loadHistory, visible]);

  useEffect(() => {
    if (!visible || !broadcastId || !signedIn) return;
    let active = true;
    let liveSocket: Socket | null = null;

    const connect = async () => {
      try {
        liveSocket = await joinLiveChat(broadcastId);
        if (!active) return;
        const onMessage = (payload: EchooChatMessage) => {
          if (payload?.id) setMessages((current) => mergeMessage(current, payload));
        };
        const onDeleted = ({ messageId }: { messageId?: string } = {}) => {
          setMessages((current) => current.filter((message) => message.id !== messageId));
        };
        const onReconnect = () => {
          liveSocket?.emit('broadcast:join', { broadcastId });
          void loadHistory();
        };
        liveSocket.on('chat:message', onMessage);
        liveSocket.on('chat:messageDeleted', onDeleted);
        liveSocket.on('connect', onReconnect);
        (liveSocket as Socket & { __echooChatCleanup?: () => void }).__echooChatCleanup = () => {
          liveSocket?.off('chat:message', onMessage);
          liveSocket?.off('chat:messageDeleted', onDeleted);
          liveSocket?.off('connect', onReconnect);
        };
      } catch {
        if (active) void loadHistory();
      }
    };

    void connect();
    return () => {
      active = false;
      (liveSocket as (Socket & { __echooChatCleanup?: () => void }) | null)?.__echooChatCleanup?.();
      leaveLiveChat(broadcastId);
    };
  }, [broadcastId, loadHistory, signedIn, visible]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    if (!signedIn) {
      onClose();
      router.push('/auth');
      return;
    }
    setSending(true);
    setError('');
    try {
      const message = await sendLiveChatMessage(broadcastId, content);
      setMessages((current) => mergeMessage(current, message));
      setText('');
    } catch (sendError: any) {
      setError(sendError?.message || 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.headerIcon}><MessageCircle color={palette.blue} size={18} /></View>
              <View style={styles.headerText}><Text style={styles.title}>Live chat</Text><Text style={styles.subtitle} numberOfLines={1}>{title}</Text></View>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Close live chat"><X color={palette.ink} size={20} /></Pressable>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={messages.length ? styles.messages : styles.emptyMessages}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.message}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.messageCopy}>
                  <View style={styles.messageMeta}><Text style={styles.author} numberOfLines={1}>{item.displayName}</Text><Text style={styles.time}>{formatTime(item.createdAt)}</Text></View>
                  <Text style={styles.messageText}>{item.content}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={loading ? <ActivityIndicator color={palette.blue} /> : <Text style={styles.emptyText}>No comments yet. Start the conversation.</Text>}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.composer}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={signedIn ? 'Write a comment' : 'Sign in to comment'}
                placeholderTextColor={palette.faint}
                maxLength={280}
                editable={!sending}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={send}
              />
              <Pressable style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]} onPress={send} disabled={!text.trim() || sending} accessibilityLabel="Send comment">
                {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Send color="#FFFFFF" size={18} />}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4, 10, 24, 0.42)' },
  sheet: { maxHeight: '82%', minHeight: 390, backgroundColor: palette.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: palette.lineStrong, alignSelf: 'center', marginTop: 10 },
  header: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.line },
  headerCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 }, title: { color: palette.ink, fontSize: 15, fontWeight: '900' }, subtitle: { color: palette.muted, fontSize: 11, marginTop: 2 },
  closeButton: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  messages: { paddingHorizontal: 16, paddingVertical: 14, gap: 15 }, emptyMessages: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { flexDirection: 'row', gap: 9 }, avatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: palette.blue, fontSize: 12, fontWeight: '900' },
  messageCopy: { flex: 1 }, messageMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 7 }, author: { maxWidth: '70%', color: palette.ink, fontSize: 12, fontWeight: '900' }, time: { color: palette.faint, fontSize: 10 }, messageText: { color: palette.ink, fontSize: 13, lineHeight: 18, marginTop: 2 },
  emptyText: { color: palette.muted, fontSize: 13, textAlign: 'center' }, error: { color: palette.red, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 16, paddingTop: 8 },
  composer: { padding: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, minHeight: 45, maxHeight: 100, borderRadius: 8, backgroundColor: palette.surfaceMuted, color: palette.ink, paddingHorizontal: 13, fontSize: 13 },
  sendButton: { width: 45, height: 45, borderRadius: 8, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' }, sendButtonDisabled: { opacity: 0.48 },
});
