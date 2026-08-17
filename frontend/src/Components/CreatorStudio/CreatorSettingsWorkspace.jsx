import { useEffect, useState } from 'react';
import {
  FaBell,
  FaEnvelope,
  FaLock,
  FaSave,
  FaUser,
} from 'react-icons/fa';

import settingsService from '../../services/settingsService';
import './CreatorSettingsConnected.css';

const CreatorSettingsWorkspace = () => {
  const [profile, setProfile] = useState({
    displayName: '',
    bio: '',
    avatar: '',
  });
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    newFollowers: true,
    newReleases: true,
  });
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [defaultPublic, setDefaultPublic] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await settingsService.get();
        if (!active) return;

        const data = response?.data || {};
        setProfile({
          displayName: data.profile?.displayName || '',
          bio: data.profile?.bio || '',
          avatar: data.profile?.avatar || '',
        });
        setEmailForm({
          email: data.profile?.email || '',
          password: '',
        });
        setNotifications({
          email: data.preferences?.notifications?.email !== false,
          push: data.preferences?.notifications?.push !== false,
          newFollowers: data.preferences?.notifications?.newFollowers !== false,
          newReleases: data.preferences?.notifications?.newReleases !== false,
        });

        try {
          const localPreference = JSON.parse(
            localStorage.getItem('echoo-creator-settings-v1') || '{}'
          );
          setDefaultPublic(localPreference.defaultPublic !== false);
        } catch {
          setDefaultPublic(true);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Could not load Creator Settings.');
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

  const run = async (name, action, success) => {
    try {
      setBusy(name);
      setError('');
      setMessage('');
      const response = await action();
      setMessage(success);
      return response;
    } catch (actionError) {
      setError(actionError?.message || 'Could not save this setting.');
      return null;
    } finally {
      setBusy('');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const response = await run(
      'profile',
      () => settingsService.updateProfile(profile),
      'Creator profile updated.'
    );

    if (response?.data?.profile) {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem(
          'user',
          JSON.stringify({ ...user, ...response.data.profile })
        );
      } catch {
        // Backend remains authoritative even if the local mirror cannot update.
      }
    }
  };

  const saveNotifications = async (event) => {
    event.preventDefault();
    await run(
      'notifications',
      () => settingsService.updateNotifications(notifications),
      'Notification settings updated.'
    );
  };

  const savePublishing = (event) => {
    event.preventDefault();
    localStorage.setItem(
      'echoo-creator-settings-v1',
      JSON.stringify({ defaultPublic })
    );
    setMessage('Default upload visibility updated for this creator workspace.');
  };

  const saveEmail = async (event) => {
    event.preventDefault();
    const response = await run(
      'email',
      () => settingsService.updateEmail(emailForm),
      'Account email updated.'
    );
    if (response) setEmailForm((current) => ({ ...current, password: '' }));
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const response = await run(
      'password',
      () => settingsService.updatePassword(passwordForm),
      'Password updated.'
    );
    if (response) {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
  };

  if (loading) {
    return <div className="creator-settings-real-message">Loading Creator Settings...</div>;
  }

  return (
    <section className="creator-settings-real">
      <header className="creator-settings-real-header">
        <span>CREATOR SETTINGS</span>
        <h2>Your creator account.</h2>
        <p>Account/profile settings are persisted by the Echoo backend.</p>
      </header>

      {message && (
        <div className="creator-settings-real-message success">{message}</div>
      )}
      {error && (
        <div className="creator-settings-real-message error">{error}</div>
      )}

      <div className="creator-settings-real-grid">
        <form className="creator-settings-real-card" onSubmit={saveProfile}>
          <h3><FaUser /> Profile</h3>
          <p>Update the identity shown around Echoo.</p>

          <label>
            <span>Display name</span>
            <input
              value={profile.displayName}
              maxLength={100}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>Bio</span>
            <textarea
              value={profile.bio}
              maxLength={500}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  bio: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>Avatar URL</span>
            <input
              value={profile.avatar}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  avatar: event.target.value,
                }))
              }
            />
          </label>

          <button type="submit" disabled={busy === 'profile'}>
            <FaSave /> {busy === 'profile' ? 'Saving...' : 'Save profile'}
          </button>
        </form>

        <form className="creator-settings-real-card" onSubmit={saveNotifications}>
          <h3><FaBell /> Notifications</h3>
          <p>Choose which Echoo account updates you receive.</p>

          {[
            ['push', 'In-app / push notifications'],
            ['email', 'Email notifications'],
            ['newFollowers', 'New follower notifications'],
            ['newReleases', 'Release and broadcast updates'],
          ].map(([key, label]) => (
            <label className="creator-settings-real-toggle" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(notifications[key])}
                onChange={(event) =>
                  setNotifications((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
            </label>
          ))}

          <button type="submit" disabled={busy === 'notifications'}>
            <FaSave /> {busy === 'notifications' ? 'Saving...' : 'Save notifications'}
          </button>
        </form>

        <form className="creator-settings-real-card" onSubmit={savePublishing}>
          <h3>Publishing default</h3>
          <p>
            This is a creator-workspace convenience default. Every uploaded audio record
            still stores its own real public/private value in the backend.
          </p>
          <label className="creator-settings-real-toggle">
            <span>Make new uploads public by default</span>
            <input
              type="checkbox"
              checked={defaultPublic}
              onChange={(event) => setDefaultPublic(event.target.checked)}
            />
          </label>
          <button type="submit"><FaSave /> Save upload default</button>
        </form>

        <form className="creator-settings-real-card" onSubmit={saveEmail}>
          <h3><FaEnvelope /> Email</h3>
          <p>Changing your account email requires your current password.</p>
          <label>
            <span>Email</span>
            <input
              type="email"
              required
              value={emailForm.email}
              onChange={(event) =>
                setEmailForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Current password</span>
            <input
              type="password"
              required
              value={emailForm.password}
              onChange={(event) =>
                setEmailForm((current) => ({ ...current, password: event.target.value }))
              }
            />
          </label>
          <button type="submit" disabled={busy === 'email'}>
            <FaSave /> {busy === 'email' ? 'Saving...' : 'Update email'}
          </button>
        </form>

        <form className="creator-settings-real-card wide" onSubmit={savePassword}>
          <h3><FaLock /> Password</h3>
          <p>Use your current password to rotate the account password.</p>
          <div className="creator-settings-real-grid">
            <label>
              <span>Current password</span>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    currentPassword: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>New password</span>
              <input
                type="password"
                required
                minLength={6}
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                required
                minLength={6}
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button type="submit" disabled={busy === 'password'}>
            <FaLock /> {busy === 'password' ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </section>
  );
};

export default CreatorSettingsWorkspace;
