import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { CheckCircle2, Circle, Heart, MessageCircle, Send, X } from 'lucide-react-native';
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
  Switch,
  View,
} from 'react-native';
import type { Socket } from 'socket.io-client';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EchooChatMessage,
  getCurrentUser,
  getPublicLiveChatMessages,
  hasEchooSession,
  reportLiveChatMessage,
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
  const [reportingMessage, setReportingMessage] = useState<EchooChatMessage | null>(null);
  const [reportReason, setReportReason] = useState('Spam or misleading content');
  const [blockAuthor, setBlockAuthor] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState('');
  const [blockedNames, setBlockedNames] = useState<string[]>([]);
  const [blockStorageKey, setBlockStorageKey] = useState('');

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
    void hasEchooSession().then(async (session) => {
      setSignedIn(session);
      if (!session) { setBlockedNames([]); setBlockStorageKey(''); return; }
      const viewer = await getCurrentUser();
      const key = `echoo:blocked-live-chat:${viewer.id}`;
      setBlockStorageKey(key);
      const saved = await SecureStore.getItemAsync(key).catch(() => null);
      let names: unknown = [];
      try { names = saved ? JSON.parse(saved) : []; } catch { names = []; }
      setBlockedNames(Array.isArray(names) ? names : []);
    }).catch(() => setSignedIn(false));
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

  const submitReport = async () => {
    if (!reportingMessage || reportPending) return;
    setReportPending(true);
    setReportError('');
    try {
      const submitted = await reportLiveChatMessage(reportingMessage.id, reportReason);
      if (!submitted) throw new Error('The report was not accepted. Please try again.');
      if (blockAuthor) {
        const name = reportingMessage.username.toLowerCase();
        const next = [...new Set([...blockedNames, name])];
        setBlockedNames(next);
        if (blockStorageKey) void SecureStore.setItemAsync(blockStorageKey, JSON.stringify(next)).catch(() => undefined);
      }
      setReportSubmitted(true);
    } catch (submitError: any) {
      setReportError(submitError?.message || 'Could not submit this report. Please try again.');
    } finally {
      setReportPending(false);
    }
  };

  const visibleMessages = messages.filter((message) => !blockedNames.includes(message.username.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <>
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
            data={visibleMessages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={visibleMessages.length ? styles.messages : styles.emptyMessages}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.message} onLongPress={() => { setReportingMessage(item); setReportSubmitted(false); setReportError(''); setBlockAuthor(false); }}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.messageCopy}>
                  <View style={styles.messageMeta}><Text style={styles.author} numberOfLines={1}>{item.displayName}</Text><Text style={styles.time}>{formatTime(item.createdAt)}</Text></View>
                  <Text style={styles.messageText}>{item.content}</Text>
                </View>
                <Heart color={palette.faint} size={17} />
              </Pressable>
            )}
            ListEmptyComponent={loading ? <ActivityIndicator color={palette.blue} /> : <Text style={styles.emptyText}>No comments yet. Start the conversation.</Text>}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!signedIn ? <View style={styles.guestPrompt}><Text style={styles.guestTitle}>Join the conversation</Text><Text style={styles.guestCopy}>Sign in to comment on {title} and take part with other listeners.</Text><Pressable style={styles.guestButton} onPress={() => { onClose(); router.push('/auth'); }}><Text style={styles.guestButtonText}>Sign In/Sign Up</Text></Pressable><Pressable onPress={onClose}><Text style={styles.guestContinue}>Continue listening as a guest</Text></Pressable></View> : <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
          </KeyboardAvoidingView>}
        </SafeAreaView>
      </View>
      <Modal visible={Boolean(reportingMessage)} transparent animationType="slide" onRequestClose={() => setReportingMessage(null)}>
        <View style={styles.reportBackdrop}><View style={styles.reportSheet}><View style={styles.handle} /><View style={styles.reportHeader}><Text style={styles.reportTitle}>Report comment</Text><Pressable onPress={() => setReportingMessage(null)}><X color={palette.muted} size={23} /></Pressable></View><Text style={styles.reportContext} numberOfLines={1}>@{reportingMessage?.displayName} · “{reportingMessage?.content}”</Text>{['Spam or misleading content', 'Harassment or hate', 'Inappropriate content', 'Something else'].map((reason) => <Pressable key={reason} style={styles.reasonRow} onPress={() => setReportReason(reason)}>{reportReason === reason ? <CheckCircle2 color={palette.blue} size={22} /> : <Circle color={palette.ink} size={22} />}<Text style={styles.reasonText}>{reason}</Text></Pressable>)}<View style={styles.blockRow}><View><Text style={styles.blockTitle}>Also block @{reportingMessage?.displayName}</Text><Text style={styles.blockCopy}>Hide this listener’s comments for you on this device</Text></View><Switch value={blockAuthor} onValueChange={setBlockAuthor} trackColor={{ false: palette.lineStrong, true: palette.blue }} /></View>{reportSubmitted ? <View style={styles.reportNotice}><CheckCircle2 color="#278065" size={21} /><Text style={styles.reportNoticeText}>Report submitted for review. Thanks for letting us know.</Text></View> : null}{reportError ? <Text style={styles.error}>{reportError}</Text> : null}<Text style={styles.reportFinePrint}>Reporting doesn’t guarantee a comment will be removed.</Text><Pressable style={styles.reportDone} disabled={reportPending} onPress={() => { if (reportSubmitted) setReportingMessage(null); else void submitReport(); }}><Text style={styles.reportDoneText}>{reportPending ? 'Submitting…' : 'Done'}</Text></Pressable></View></View>
      </Modal>
      </>
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
  guestPrompt: { padding: 22, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.surface },
  guestTitle: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  guestCopy: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  guestButton: { minHeight: 58, borderRadius: 29, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  guestButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  guestContinue: { color: palette.blue, fontSize: 13.5, fontWeight: '800', textAlign: 'center', marginTop: 18 },
  reportBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  reportSheet: { backgroundColor: palette.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 28, paddingTop: 10, paddingBottom: 30 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  reportTitle: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  reportContext: { color: palette.muted, fontSize: 12.5, marginBottom: 14 },
  reasonRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reasonText: { color: palette.ink, fontSize: 13.5, fontWeight: '700' },
  blockRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  blockCopy: { color: palette.muted, fontSize: 12, marginTop: 4 },
  reportNotice: { minHeight: 55, borderRadius: 10, backgroundColor: '#E7F2EC', marginTop: 18, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportNoticeText: { flex: 1, color: '#278065', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  reportFinePrint: { color: palette.muted, fontSize: 11.5, lineHeight: 16, marginTop: 18 },
  reportDone: { minHeight: 56, borderRadius: 28, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  reportDoneText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
