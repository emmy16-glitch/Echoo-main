import { useEffect, useRef, useState } from 'react';
import {
  FaCamera,
  FaLock,
  FaSave,
} from 'react-icons/fa';

import settingsService from '../../services/settingsService';
import {
  DESKTOP_NOTIFICATION_EVENTS,
  getDesktopAutoLaunch,
  getDesktopNotificationPreferences,
  isEchooDesktop,
  setDesktopAutoLaunch,
  setDesktopNotificationPreferences,
} from '../../services/desktopBridge';
import {
  getRecordingDevicePreferences,
  chooseRecordingDeviceFormat,
} from '../../services/recordingDevicePreferences.js';
import './CreatorSettingsConnected.css';
import './CreatorStudioRuntimeFixes.css';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'security', label: 'Account & Security' },
];

const CreatorSettingsWorkspace = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({ displayName: '', bio: '', avatar: '' });
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [desktopNotificationPreferences, setDesktopNotificationPreferencesState] = useState({
    notificationsEnabled: false,
    notificationEvents: DESKTOP_NOTIFICATION_EVENTS,
  });
  const [desktopPreferenceLoading, setDesktopPreferenceLoading] = useState(isEchooDesktop());
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(isEchooDesktop());
  const initialRecordingPreferences = getRecordingDevicePreferences();
  const [recordingChoice, setRecordingChoice] = useState(
    initialRecordingPreferences.autoSave ? initialRecordingPreferences.format : 'none'
  );
  const avatarInputRef = useRef(null);
  const isDesktop = isEchooDesktop();

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
        setEmailForm({ email: data.profile?.email || '', password: '' });
        setNotifications({
          email: data.preferences?.notifications?.email !== false,
          push: data.preferences?.notifications?.push !== false,
          newFollowers: data.preferences?.notifications?.newFollowers !== false,
          newReleases: data.preferences?.notifications?.newReleases !== false,
        });
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load Settings.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      setDesktopPreferenceLoading(false);
      return undefined;
    }

    let active = true;
    getDesktopNotificationPreferences()
      .then((preferences) => {
        if (!active) return;
        setDesktopNotificationPreferencesState({
          notificationsEnabled: preferences?.notificationsEnabled === true,
          notificationEvents: {
            ...DESKTOP_NOTIFICATION_EVENTS,
            ...(preferences?.notificationEvents || {}),
          },
        });
      })
      .catch(() => {
        if (active) setError('Could not load desktop notification preferences.');
      })
      .finally(() => {
        if (active) setDesktopPreferenceLoading(false);
      });

    return () => { active = false; };
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setAutoLaunchLoading(false);
      return undefined;
    }

    let active = true;
    getDesktopAutoLaunch()
      .then((result) => {
        if (!active) return;
        setAutoLaunch(result?.openAtLogin === true);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setAutoLaunchLoading(false);
      });

    return () => { active = false; };
  }, [isDesktop]);

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
    const response = await run('profile', () => settingsService.updateProfile(profile), 'Profile updated.');
    if (response?.data?.profile) {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...user, ...response.data.profile }));
      } catch {
        // The profile is already saved remotely.
      }
    }
  };

  const saveNotifications = async (event) => {
    event.preventDefault();
    await run(
      'notifications',
      () => settingsService.updateNotifications(notifications),
      'Notification preferences updated.'
    );
  };

  const saveDesktopNotificationPreferences = async (update, success) => {
    if (!isDesktop || desktopPreferenceLoading) return;
    try {
      setDesktopPreferenceLoading(true);
      setError('');
      const saved = await setDesktopNotificationPreferences(update);
      setDesktopNotificationPreferencesState({
        notificationsEnabled: saved?.notificationsEnabled === true,
        notificationEvents: {
          ...DESKTOP_NOTIFICATION_EVENTS,
          ...(saved?.notificationEvents || desktopNotificationPreferences.notificationEvents),
        },
      });
      setMessage(success);
    } catch (saveError) {
      setError(saveError?.message || 'Could not update the desktop alert preference.');
    } finally {
      setDesktopPreferenceLoading(false);
    }
  };

  const saveAutoLaunch = async (enabled) => {
    if (!isDesktop || autoLaunchLoading) return;
    try {
      setAutoLaunchLoading(true);
      setError('');
      const saved = await setDesktopAutoLaunch(enabled);
      setAutoLaunch(saved?.openAtLogin === true);
      setMessage(saved?.openAtLogin
        ? 'Echoo Desktop will start automatically when you sign in to this computer.'
        : 'Echoo Desktop will no longer start automatically.');
    } catch (saveError) {
      setError(saveError?.message || 'Could not update the startup preference.');
    } finally {
      setAutoLaunchLoading(false);
    }
  };

  const saveRecordingPreference = () => {
    const saved = chooseRecordingDeviceFormat(recordingChoice);
    setRecordingChoice(saved.autoSave ? saved.format : 'none');
    setMessage(saved.autoSave
      ? `Future broadcasts will automatically keep a ${saved.format.toUpperCase()} copy on this device.`
      : 'Future broadcasts will stay on Echoo only unless you export them manually.');
    setError('');
  };

  const saveEmail = async (event) => {
    event.preventDefault();
    const response = await run('email', () => settingsService.updateEmail(emailForm), 'Email updated.');
    if (response) setEmailForm((current) => ({ ...current, password: '' }));
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    const response = await run(
      'password',
      () => settingsService.updatePassword(passwordForm),
      'Password updated.'
    );
    if (response) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  };

  const handleAvatarFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose a valid image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Profile images must be 3 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfile((current) => ({ ...current, avatar: String(reader.result || '') }));
      setError('');
    };
    reader.onerror = () => setError('Could not read that image.');
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="creator-settings-real-message">Loading settings…</div>;

  const initial = String(profile.displayName || 'E').trim().charAt(0).toUpperCase() || 'E';

  return (
    <section className="creator-settings-real">
      <header className="creator-settings-real-header">
        <h2>Settings</h2>
        <p>Manage your Echoo account.</p>
      </header>

      <div className="creator-settings-panel">
        <nav className="creator-settings-tabs" aria-label="Settings sections">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
                setMessage('');
              }}
            >
              <span className="creator-settings-tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="creator-settings-panel-body">
          {message && <div className="creator-settings-real-message success">{message}</div>}
          {error && <div className="creator-settings-real-message error">{error}</div>}

          {activeTab === 'profile' && (
        <div className="creator-settings-section">
          <form className="creator-settings-real-card" onSubmit={saveProfile}>
            <div className="creator-settings-section-heading">
              <h3>Profile</h3>
              <p>Manage your personal Echoo profile.</p>
            </div>

            <div className="creator-settings-avatar-row">
              <div className="creator-settings-avatar">
                {profile.avatar ? <img src={profile.avatar} alt="Profile preview" /> : initial}
              </div>
              <div className="creator-settings-avatar-actions">
                <strong>Profile photo</strong>
                <span>JPG, PNG or WebP · up to 3 MB</span>
                <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
                <button type="button" onClick={() => avatarInputRef.current?.click()}>
                  <FaCamera /> Change photo
                </button>
              </div>
            </div>

            <label>
              <span>Display name</span>
              <input
                value={profile.displayName}
                maxLength={100}
                onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>

            <label>
              <span>Bio</span>
              <textarea
                value={profile.bio}
                maxLength={500}
                placeholder="Tell people a little about yourself."
                onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))}
              />
            </label>

            <button type="submit" disabled={busy === 'profile'}>
              <FaSave /> {busy === 'profile' ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      )}

          {activeTab === 'notifications' && (
        <div className="creator-settings-section">
          <form className="creator-settings-real-card" onSubmit={saveNotifications}>
            <div className="creator-settings-section-heading">
              <h3>Notifications</h3>
              <p>Choose the account updates you want Echoo to send you.</p>
            </div>

            {[
              ['push', 'Push notifications', 'Account and broadcast alerts in supported clients.'],
              ['email', 'Email notifications', 'Important updates sent to your account email.'],
              ['newFollowers', 'New followers', 'Know when somebody follows your Channel.'],
              ['newReleases', 'Broadcast updates', 'Updates related to your live and published content.'],
            ].map(([key, label, description]) => (
              <label className="creator-settings-real-toggle" key={key}>
                <span><strong>{label}</strong><small>{description}</small></span>
                <input
                  type="checkbox"
                  checked={Boolean(notifications[key])}
                  onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))}
                />
              </label>
            ))}

            <button type="submit" disabled={busy === 'notifications'}>
              <FaSave /> {busy === 'notifications' ? 'Saving…' : 'Save preferences'}
            </button>
          </form>

          {isDesktop && (
            <section className="creator-settings-real-card creator-settings-desktop-card">
              <div className="creator-settings-section-heading">
                <h3>Desktop alerts</h3>
                <p>Choose which neutral native alerts Echoo Desktop may show on this device.</p>
              </div>

              <label className="creator-settings-real-toggle">
                <span><strong>Show desktop alerts</strong><small>Turn native alerts on or off for this computer.</small></span>
                <input
                  type="checkbox"
                  checked={desktopNotificationPreferences.notificationsEnabled}
                  disabled={desktopPreferenceLoading}
                  onChange={(event) => saveDesktopNotificationPreferences(
                    { notificationsEnabled: event.target.checked },
                    event.target.checked ? 'Desktop alerts enabled.' : 'Desktop alerts turned off.'
                  )}
                />
              </label>

              <label className="creator-settings-real-toggle">
                <span><strong>Open Echoo at login</strong><small>Start Echoo Desktop automatically when you sign in to this computer.</small></span>
                <input
                  type="checkbox"
                  checked={autoLaunch}
                  disabled={autoLaunchLoading}
                  onChange={(event) => saveAutoLaunch(event.target.checked)}
                />
              </label>

              {[
                ['message', 'Live-room messages', 'Neutral alerts for incoming live-room messages.'],
                ['roomStarted', 'Room started', 'Neutral alerts when a live room becomes active.'],
                ['roomEnded', 'Room ended', 'Neutral alerts when a live room ends.'],
                ['listenerJoined', 'New listeners', 'Neutral alerts when a listener joins your broadcast.'],
              ].map(([key, label, description]) => (
                <label className="creator-settings-real-toggle" key={key}>
                  <span><strong>{label}</strong><small>{description}</small></span>
                  <input
                    type="checkbox"
                    checked={desktopNotificationPreferences.notificationEvents[key] === true}
                    disabled={desktopPreferenceLoading}
                    onChange={(event) => saveDesktopNotificationPreferences(
                      {
                        notificationEvents: {
                          ...desktopNotificationPreferences.notificationEvents,
                          [key]: event.target.checked,
                        },
                      },
                      `${label} ${event.target.checked ? 'enabled' : 'disabled'} for Echoo Desktop.`
                    )}
                  />
                </label>
              ))}
            </section>
          )}
        </div>
      )}

          {activeTab === 'recordings' && (
        <div className="creator-settings-section">
          <section className="creator-settings-real-card creator-settings-recordings-card">
            <div className="creator-settings-section-heading">
              <h3>Recording copies</h3>
              <p>Echoo always saves the canonical server replay automatically as a high-quality MP3. Choose once how this device should keep its own copy after each broadcast.</p>
            </div>

            <div className="creator-settings-server-copy">
              <strong>Echoo server copy</strong>
              <span>Automatic · MP3 · stored with the broadcast in Recordings</span>
            </div>

            <fieldset className="creator-settings-recording-options">
              <legend>Automatic copy on this device</legend>
              <label className={recordingChoice === 'mp3' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="recording-device-copy"
                  value="mp3"
                  checked={recordingChoice === 'mp3'}
                  onChange={() => setRecordingChoice('mp3')}
                />
                <span>
                  <strong>MP3 · Recommended</strong>
                  <small>High quality, much smaller than WAV, and easy to play or share.</small>
                </span>
              </label>
              <label className={recordingChoice === 'wav' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="recording-device-copy"
                  value="wav"
                  checked={recordingChoice === 'wav'}
                  onChange={() => setRecordingChoice('wav')}
                />
                <span>
                  <strong>WAV · Lossless master</strong>
                  <small>Keeps the original PCM master for editing. Files can be hundreds of megabytes.</small>
                </span>
              </label>
              <label className={recordingChoice === 'none' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="recording-device-copy"
                  value="none"
                  checked={recordingChoice === 'none'}
                  onChange={() => setRecordingChoice('none')}
                />
                <span>
                  <strong>Server only</strong>
                  <small>Keep the automatic Echoo server MP3 and download a device copy only when you ask.</small>
                </span>
              </label>
            </fieldset>

            <div className="creator-settings-recording-location">
              <strong>Where device copies go</strong>
              <span>
                {isDesktop
                  ? 'Echoo Desktop files recordings into Desktop/Echoo Recordings/<year>/<month>.'
                  : 'Web browsers save into their normal Downloads storage because websites cannot silently create arbitrary folders on a computer or phone.'}
              </span>
            </div>

            <button type="button" onClick={saveRecordingPreference}>
              <FaSave /> Save recording preference
            </button>
          </section>
        </div>
      )}

          {activeTab === 'security' && (
        <div className="creator-settings-section creator-settings-security-grid">
          <div className="creator-settings-section-heading creator-settings-security-heading">
            <h3>Account &amp; Security</h3>
            <p>Manage your sign-in email and password.</p>
          </div>
          <form className="creator-settings-real-card" onSubmit={saveEmail}>
            <div className="creator-settings-section-heading">
              <h3>Email</h3>
              <p>Confirm your current password before changing your sign-in email.</p>
            </div>
            <label>
              <span>Email</span>
              <input type="email" required value={emailForm.email} onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              <span>Current password</span>
              <input type="password" required autoComplete="current-password" value={emailForm.password} onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <button type="submit" disabled={busy === 'email'}>
              <FaSave /> {busy === 'email' ? 'Saving…' : 'Update email'}
            </button>
          </form>

          <form className="creator-settings-real-card" onSubmit={savePassword}>
            <div className="creator-settings-section-heading">
              <h3><FaLock /> Password</h3>
              <p>Use a password you do not use on another service.</p>
            </div>
            <label>
              <span>Current password</span>
              <input type="password" required autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
            </label>
            <label>
              <span>New password</span>
              <input type="password" required minLength={6} autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
            </label>
            <label>
              <span>Confirm password</span>
              <input type="password" required minLength={6} autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
            </label>
            <button type="submit" disabled={busy === 'password'}>
              <FaLock /> {busy === 'password' ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      )}
        </div>
      </div>
    </section>
  );
};

export default CreatorSettingsWorkspace;
