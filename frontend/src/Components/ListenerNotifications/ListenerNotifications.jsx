import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBell,
  FaBroadcastTower,
  FaCheck,
  FaTrash,
  FaUserPlus,
} from 'react-icons/fa';

import notificationService from '../../services/notificationService';
import './ListenerNotifications.css';

const iconFor = (type) => {
  if (type === 'new_follower') return <FaUserPlus />;
  if (type === 'broadcast_live' || type === 'broadcast_ended') {
    return <FaBroadcastTower />;
  }
  return <FaBell />;
};

const ListenerNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await notificationService.list({ limit: 100 });
        if (!active) return;
        setNotifications(response?.data?.notifications || []);
        setUnreadCount(response?.data?.unreadCount || 0);
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Could not load notifications.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

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
      // Navigation should not be blocked because a read receipt failed.
    }

    if (notification.link) {
      navigate(notification.link);
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
    <main className="ln-page">
      <button type="button" className="ln-back" onClick={() => navigate('/listen')}>
        <FaArrowLeft /> Home
      </button>

      <header className="ln-header">
        <div>
          <span>NOTIFICATIONS</span>
          <h1>What needs your attention.</h1>
          <p>Real Echoo activity from creators, broadcasts and your account.</p>
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
          <p>New Echoo activity will appear here.</p>
        </div>
      ) : (
        <section className="ln-list">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`ln-item ${notification.read ? '' : 'unread'}`}
              onClick={() => openNotification(notification)}
            >
              <div className="ln-icon">{iconFor(notification.type)}</div>
              <div className="ln-copy">
                <div>
                  <strong>{notification.title}</strong>
                  {!notification.read && <span>NEW</span>}
                </div>
                <p>{notification.message}</p>
                <time>
                  {notification.createdAt
                    ? new Date(notification.createdAt).toLocaleString()
                    : ''}
                </time>
              </div>
              <button
                type="button"
                className="ln-delete"
                aria-label="Delete notification"
                disabled={busyId === notification.id}
                onClick={(event) => remove(event, notification)}
              >
                <FaTrash />
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
};

export default ListenerNotifications;
