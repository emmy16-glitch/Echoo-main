import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaArrowRight,
  FaBell,
  FaBroadcastTower,
  FaCheck,
  FaClock,
  FaDownload,
  FaCog,
  FaHeadphones,
  FaPodcast,
  FaUserPlus,
} from 'react-icons/fa';
import Toast from '../ListenerUI/ListenerToast';
import notificationService from '../../services/notificationService';
import '../../styles/listener-reference-pages.css';
import './ListenerNotifications.css';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'updates', label: 'Updates' },
  { id: 'system', label: 'System' },
];

const TYPE_STYLE = {
  broadcast_live: { color: '#1769d3' },
  broadcast_reminder: { color: '#1769d3' },
  broadcast_ended: { color: '#5f6f85' },
  new_release: { color: '#7c3aed' },
  new_follower: { color: '#1769d3' },
  new_comment: { color: '#f59e0b' },
  new_like: { color: '#f43f5e' },
  tip_received: { color: '#16a34a' },
  tip_sent: { color: '#16a34a' },
  achievement_unlocked: { color: '#f59e0b' },
  system_announcement: { color: '#5f6f85' },
};

const iconFor = (type) => {
  switch (type) {
    case 'broadcast_live':
    case 'broadcast_reminder':
    case 'broadcast_ended':
      return <FaBroadcastTower />;
    case 'new_release':
      return <FaHeadphones />;
    case 'new_follower':
      return <FaUserPlus />;
    case 'tip_received':
    case 'tip_sent':
      return <FaDownload />;
    case 'achievement_unlocked':
      return <FaPodcast />;
    case 'new_comment':
    case 'new_like':
      return <FaUserPlus />;
    case 'system_announcement':
      return <FaCog />;
    default:
      return <FaBell />;
  }
};

const tabFor = (notification) => {
  const type = String(notification.type || '');
  if (type === 'system_announcement') return 'system';
  if (type === 'new_like' || type === 'new_comment') return 'mentions';
  return 'updates';
};

const relativeTime = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const ListenerNotificationsConnected = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });

  const notify = useCallback((message, type = 'info') => {
    setToast({
      open: true,
      type,
      title: type === 'error' ? 'Something went wrong' : 'Notifications',
      message,
    });
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await notificationService.list({ limit: 100 });
      const items = response?.data?.notifications || [];
      setNotifications(items);
      setUnreadCount(Number(response?.data?.unreadCount) || 0);
    } catch (error) {
      console.error('Notifications load failed', error);
      if (!silent) notify('Could not load notifications', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
    const sync = () => load({ silent: true });
    const interval = window.setInterval(sync, 15000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === 'all') return notifications;
    return notifications.filter((n) => tabFor(n) === tab);
  }, [notifications, tab]);

  const markRead = async (notificationId) => {
    if (busyId) return;
    try {
      setBusyId(String(notificationId));
      await notificationService.markRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          String(n.id) === String(notificationId) ? { ...n, read: true } : n
        )
      );
      setUnreadCount((value) => Math.max(0, value - 1));
    } catch (error) {
      console.error('Mark read failed', error);
    } finally {
      setBusyId('');
    }
  };

  const markAllRead = async () => {
    if (busyId === 'all' || unreadCount === 0) return;
    try {
      setBusyId('all');
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      notify('All notifications marked as read', 'success');
    } catch (error) {
      console.error('Mark all read failed', error);
      notify('Could not mark all as read', 'error');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="ln-page">
      <div className="ln-header">
        <div>
          <h1>Notifications</h1>
          <p className="ln-subtitle">Stay updated with what matters to you.</p>
        </div>
      </div>

      <div className="ln-tabs-row">
        <div className="ln-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ln-tab ${tab === t.id ? 'ln-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ln-mark-all"
          disabled={busyId === 'all' || unreadCount === 0}
          onClick={markAllRead}
        >
          {busyId === 'all' ? 'Marking…' : 'Mark all as read'}
        </button>
      </div>

      {loading ? (
        <div className="ln-empty ln-empty-loading">Loading your notifications…</div>
      ) : filtered.length === 0 ? (
        <div className="ln-empty">
          <FaClock />
          <strong>
            {notifications.length === 0
              ? 'No notifications yet.'
              : 'Nothing in this category yet.'}
          </strong>
          <p>
            {notifications.length === 0
              ? 'You will be notified here when stations go live, new episodes drop, or creators engage with you.'
              : 'Switch to another category to see more notifications.'}
          </p>
        </div>
      ) : (
        <div className="ln-list">
          {filtered.map((notification) => {
            const style =
              TYPE_STYLE[notification.type] || { color: '#5f6f85' };
            return (
              <button
                key={notification.id}
                type="button"
                className={`ln-row ${notification.read ? '' : 'ln-row-unread'}`}
                onClick={() => markRead(notification.id)}
              >
                <span className="ln-icon" style={{ color: style.color }}>
                  {iconFor(notification.type)}
                </span>
                <span className="ln-body">
                  <span className="ln-title">{notification.title || 'Notification'}</span>
                  <span className="ln-message">{notification.message}</span>
                  <span className="ln-when">{relativeTime(notification.createdAt)}</span>
                </span>
                <span className="ln-trail">
                  {!notification.read && <span className="ln-dot" />}
                  <FaCheck className="ln-read-icon" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="ln-view-all"
        disabled={loading || notifications.length === 0}
        onClick={() => notify('These are all of your notifications.', 'info')}
      >
        View all notifications
        <FaArrowRight />
      </button>

      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
};

export default ListenerNotificationsConnected;
