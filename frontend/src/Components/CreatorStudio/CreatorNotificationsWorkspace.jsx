import { useCallback, useEffect, useState } from 'react';
import {
  FaBell,
  FaBroadcastTower,
  FaCheck,
  FaTrash,
  FaUserPlus,
} from 'react-icons/fa';

import notificationService from '../../services/notificationService';
import './CreatorNotificationsWorkspace.css';

const iconFor = (type) => {
  if (type === 'new_follower') return <FaUserPlus />;
  if (type === 'broadcast_live' || type === 'broadcast_ended' || type === 'transcript_ready') {
    return <FaBroadcastTower />;
  }
  return <FaBell />;
};

const broadcastIdFromNotification = (notification) => {
  const metadataId = notification?.metadata?.broadcastId;
  if (metadataId) return String(metadataId);

  const link = String(notification?.link || '');
  const match = link.match(/^\/creator\/broadcasts\/([^/]+)(?:\/processing)?\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
};

const CreatorNotificationsWorkspace = ({ onNavigate }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await notificationService.list({ limit: 100 });
      setNotifications(response?.data?.notifications || []);
      setUnreadCount(Number(response?.data?.unreadCount) || 0);
    } catch (loadError) {
      setNotifications([]);
      setUnreadCount(0);
      setError(loadError?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNotification = async (notification) => {
    try {
      if (!notification.read) {
        await notificationService.markRead(notification.id);
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, read: true } : item
          )
        );
        setUnreadCount((value) => Math.max(0, value - 1));
      }
    } catch {
      // Reading a notification should not prevent the user from continuing.
    }

    const link = String(notification.link || '');
    const broadcastId = broadcastIdFromNotification(notification);

    if (notification.type === 'transcript_ready' || /\/creator\/broadcasts\/[^/]+\/processing\/?$/i.test(link)) {
      // Prepared broadcast is the single source of truth for a notification
      // deep-link. Remove the old processing key so it cannot survive and keep
      // reordering future Broadcast Studio opens after this click is handled.
      sessionStorage.removeItem('echooProcessingBroadcastId');
      if (broadcastId) sessionStorage.setItem('echooPreparedBroadcastId', broadcastId);
      onNavigate?.('Broadcast');
      return;
    }

    if (notification.type === 'broadcast_live') {
      sessionStorage.removeItem('echooProcessingBroadcastId');
      if (broadcastId) sessionStorage.setItem('echooPreparedBroadcastId', broadcastId);
      sessionStorage.setItem('echooBroadcastMode', 'now');
      onNavigate?.('Live');
      return;
    }

    if (link.startsWith('/creator-studio')) {
      onNavigate?.('Home');
    }
  };

  const markAllRead = async () => {
    try {
      setBusyId('all');
      setError('');
      await notificationService.markAllRead();
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (actionError) {
      setError(actionError?.message || 'Could not mark notifications as read.');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (event, notification) => {
    event.stopPropagation();
    try {
      setBusyId(notification.id);
      setError('');
      await notificationService.remove(notification.id);
      setNotifications((current) =>
        current.filter((item) => item.id !== notification.id)
      );
      if (!notification.read) {
        setUnreadCount((value) => Math.max(0, value - 1));
      }
    } catch (actionError) {
      setError(actionError?.message || 'Could not remove the notification.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="ln-page" aria-labelledby="creator-notifications-title">
      <header className="ln-header">
        <div>
          <span>CREATOR NOTIFICATIONS</span>
          <h1 id="creator-notifications-title">What needs your attention.</h1>
          <p>Real Echoo activity for your creator account and broadcasts.</p>
        </div>
        <button
          type="button"
          className="ln-read-all"
          disabled={!unreadCount || busyId === 'all'}
          onClick={markAllRead}
        >
          <FaCheck /> {busyId === 'all' ? 'Updating...' : 'Mark all read'}
        </button>
      </header>

      {error && <div className="ln-message error">{error}</div>}

      {loading ? (
        <div className="ln-empty">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="ln-empty">
          <FaBell />
          <h2>You're all caught up</h2>
          <p>New creator activity will appear here.</p>
        </div>
      ) : (
        <div className="ln-list">
          {notifications.map((notification) => (
            <article key={notification.id} className={`ln-item ${notification.read ? '' : 'unread'}`}>
              <button
                type="button"
                className="ln-open"
                onClick={() => openNotification(notification)}
                aria-label={`Open notification: ${notification.title || 'Echoo notification'}`}
              >
                <span className="ln-icon" aria-hidden="true">{iconFor(notification.type)}</span>
                <span className="ln-copy">
                  <span className="ln-copy-title">
                    <strong>{notification.title}</strong>
                    {!notification.read && <span className="ln-new-badge">NEW</span>}
                  </span>
                  <span className="ln-copy-message">{notification.message}</span>
                  <time>{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ''}</time>
                </span>
              </button>
              <button
                type="button"
                className="ln-delete"
                aria-label={`Delete ${notification.title || 'notification'}`}
                disabled={busyId === notification.id}
                onClick={(event) => remove(event, notification)}
              >
                <FaTrash />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default CreatorNotificationsWorkspace;
