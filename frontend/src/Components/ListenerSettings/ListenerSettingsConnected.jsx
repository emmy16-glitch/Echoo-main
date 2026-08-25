import { useCallback, useEffect, useState } from 'react';
import {
  FaBell,
  FaCheck,
  FaChevronDown,
  FaDownload,
  FaInfoCircle,
  FaLock,
  FaShieldAlt,
  FaSlidersH,
  FaUser,
} from 'react-icons/fa';
import settingsService from '../../services/settingsService';
import {
  getDesktopNotificationPreference,
  isEchooDesktop,
  setDesktopNotificationPreference,
} from '../../services/desktopBridge';
import '../../styles/listener-reference-pages.css';
import './ListenerSettings.css';

const NAV_GROUPS = [
  { id: 'profile', label: 'Profile', icon: <FaUser /> },
  { id: 'account', label: 'Account', icon: <FaLock /> },
  { id: 'playback', label: 'Playback', icon: <FaSlidersH /> },
  { id: 'downloads', label: 'Downloads', icon: <FaDownload /> },
  { id: 'notifications', label: 'Notifications', icon: <FaBell /> },
  { id: 'privacy', label: 'Privacy', icon: <FaShieldAlt /> },
  { id: 'about', label: 'About Echoo', icon: <FaInfoCircle /> },
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'sw', label: 'Kiswahili' },
];

const usernameFor = (username) =>
  username ? `@${username}` : '@not set';

const ListenerSettingsConnected = () => {
  const [nav, setNav] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('en');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [location, setLocation] = useState('');
  const [username, setUsername] = useState('');
  const [website, setWebsite] = useState('');
  const [toast, setToast] = useState({ open: false, title: '', message: '' });
  const [dirty, setDirty] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [desktopPreferenceLoading, setDesktopPreferenceLoading] = useState(isEchooDesktop());
  const isDesktop = isEchooDesktop();

  const notify = useCallback((message, success = true) => {
    setToast({
      open: true,
      title: success ? 'Settings saved' : 'Something went wrong',
      message,
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await settingsService.get();
      const settings = response?.data || {};
      const profile = settings.profile || {};
      const preferences = settings.preferences || {};
      const notifications = preferences.notifications || {};
      setDisplayName(profile.displayName || '');
      setBio(typeof profile.bio === 'string' ? profile.bio : '');
      setUsername(profile.username || '');
      setLanguage(String(preferences.language || 'en'));
      setEmailNotifications(notifications.email !== false);
      setPushNotifications(notifications.push !== false);
      setLocation(profile.location || '');
      setWebsite(profile.website || '');
      setDirty(false);
    } catch (error) {
      console.error('Settings load failed', error);
      setToast({ open: true, title: 'Something went wrong', message: 'Could not load your settings.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isDesktop) {
      setDesktopPreferenceLoading(false);
      return;
    }

    let active = true;
    getDesktopNotificationPreference()
      .then((enabled) => {
        if (active) setDesktopNotifications(enabled === true);
      })
      .catch(() => {
        if (active) {
          setToast({ open: true, title: 'Something went wrong', message: 'Could not load your desktop notification setting.' });
        }
      })
      .finally(() => {
        if (active) setDesktopPreferenceLoading(false);
      });

    return () => { active = false; };
  }, [isDesktop]);

  const toggleDesktopNotifications = async () => {
    if (!isDesktop || desktopPreferenceLoading) return;

    const next = !desktopNotifications;
    try {
      setDesktopPreferenceLoading(true);
      const saved = await setDesktopNotificationPreference(next);
      setDesktopNotifications(saved === true);
      setToast({
        open: true,
        title: 'Desktop notifications updated',
        message: saved
          ? 'Echoo can now show neutral room and message alerts while the desktop app is in the background.'
          : 'Desktop alerts are turned off. Your room and message content remains private.',
      });
    } catch (error) {
      setToast({ open: true, title: 'Something went wrong', message: 'Could not update your desktop notification setting.' });
    } finally {
      setDesktopPreferenceLoading(false);
    }
  };

  const save = async () => {
    if (saving || !dirty) return;
    try {
      setSaving(true);
      await settingsService.updateProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim(),
      });
      await settingsService.updatePreferences({
        language: language || undefined,
        notifications: {
          email: emailNotifications,
          push: pushNotifications,
        },
      });
      setDirty(false);
      notify('Your profile and preferences have been updated.');
    } catch (error) {
      console.error('Settings save failed', error);
      setToast({
        open: true,
        title: 'Something went wrong',
        message: 'Could not save your settings. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="set-page">
        <div className="set-empty set-empty-loading">Loading your settings…</div>
      </div>
    );
  }

  return (
    <div className="set-page">
      <header className="set-header">
        <span>SETTINGS</span>
        <h1>Your account.</h1>
        <p className="set-subtitle">
          Manage how you appear on Echoo, what reaches you, and how your account is protected.
        </p>
      </header>

      <div className="set-layout">
        <nav className="set-nav" aria-label="Settings categories">
          {NAV_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`set-nav-item ${nav === item.id ? 'set-nav-active' : ''}`}
              onClick={() => setNav(item.id)}
            >
              <span className="set-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="set-main">
          {nav === 'notifications' ? (
            <div className="set-card">
              <div className="set-card-inner">
                <strong className="set-card-title">Desktop notifications</strong>
                <p className="set-toggle-desc" style={{ marginTop: '0.5rem', maxWidth: '42rem' }}>
                  Choose whether Echoo Desktop can show neutral alerts for incoming messages and room events while the app is in the background.
                </p>

                {isDesktop ? (
                  <div className="set-toggle-row" style={{ marginTop: '1.5rem' }}>
                    <div className="set-toggle-info">
                      <strong className="set-toggle-title">Show desktop alerts</strong>
                      <span className="set-toggle-desc">
                        Alerts never include room names, message text, or other private conversation content.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Desktop notifications"
                      aria-checked={desktopNotifications}
                      aria-busy={desktopPreferenceLoading}
                      disabled={desktopPreferenceLoading}
                      className={`set-toggle ${desktopNotifications ? 'set-toggle-on' : ''}`}
                      onClick={toggleDesktopNotifications}
                    >
                      <span className="set-toggle-thumb" />
                    </button>
                  </div>
                ) : (
                  <div className="set-readonly set-readonly-empty" style={{ marginTop: '1.5rem' }}>
                    Open Echoo Desktop to manage native desktop alerts.
                  </div>
                )}
              </div>
            </div>
          ) : nav !== 'profile' ? (
            <div className="set-panel set-panel-coming">
              <h2>{NAV_GROUPS.find((g) => g.id === nav)?.label || 'Settings'}</h2>
              <p>This section is managed through your account profile for now.</p>
              <button type="button" className="set-back-btn" onClick={() => setNav('profile')}>
                Back to profile settings
              </button>
            </div>
          ) : (
            <>
              <div className="set-card">
                <div className="set-card-inner">
                  <div className="set-avatar-row">
                    <span className="set-avatar">
                      {displayName ? displayName.charAt(0).toUpperCase() : 'E'}
                    </span>
                    <div>
                      <strong className="set-avatar-name">Profile information</strong>
                      <button
                        type="button"
                        className="set-change-photo"
                        onClick={() => notify('Photo uploads are managed from your profile page.', false)}
                      >
                        Change photo
                      </button>
                    </div>
                  </div>

                  <div className="set-field">
                    <label className="set-label" htmlFor="set-full-name">Full name</label>
                    <input
                      id="set-full-name"
                      type="text"
                      className="set-input"
                      value={displayName}
                      maxLength={50}
                      onChange={(event) => {
                        setDisplayName(event.target.value);
                        setDirty(true);
                      }}
                      placeholder="Your display name"
                    />
                  </div>

                  <div className="set-field">
                    <span className="set-label">Username</span>
                    <div className="set-readonly">{usernameFor(username)}</div>
                  </div>

                  <div className="set-field">
                    <label className="set-label" htmlFor="set-bio">Bio</label>
                    <textarea
                      id="set-bio"
                      className="set-input set-textarea"
                      rows={4}
                      maxLength={500}
                      value={bio}
                      onChange={(event) => {
                        setBio(event.target.value);
                        setDirty(true);
                      }}
                      placeholder="Tell listeners a little about yourself…"
                    />
                  </div>

                  <div className="set-field">
                    <span className="set-label">Location</span>
                    {location ? (
                      <div className="set-readonly">{location}</div>
                    ) : (
                      <div className="set-readonly set-readonly-empty">Not set</div>
                    )}
                  </div>

                  <div className="set-field">
                    <span className="set-label">Website</span>
                    {website ? (
                      <div className="set-readonly">{website}</div>
                    ) : (
                      <div className="set-readonly set-readonly-empty">Not set</div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="set-save-btn"
                    disabled={saving || !dirty}
                    onClick={save}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>

              <div className="set-card">
                <div className="set-card-inner">
                  <strong className="set-card-title">Preferences</strong>

                  <div className="set-field">
                    <label className="set-label" htmlFor="set-language">Default content language</label>
                    <div className="set-select-wrap">
                      <select
                        id="set-language"
                        className="set-select"
                        value={language}
                        onChange={(event) => {
                          setLanguage(event.target.value);
                          setDirty(true);
                        }}
                      >
                        {LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>{lang.label}</option>
                        ))}
                      </select>
                      <FaChevronDown className="set-select-chevron" aria-hidden="true" />
                    </div>
                  </div>

                  <div className="set-toggle-row">
                    <div className="set-toggle-info">
                      <strong className="set-toggle-title">Email notifications</strong>
                      <span className="set-toggle-desc">
                        Receive important Echoo account and content updates by email.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Email notifications"
                      aria-checked={emailNotifications}
                      className={`set-toggle ${emailNotifications ? 'set-toggle-on' : ''}`}
                      onClick={() => {
                        setEmailNotifications((value) => !value);
                        setDirty(true);
                      }}
                    >
                      <span className="set-toggle-thumb" />
                    </button>
                  </div>

                  <div className="set-toggle-row">
                    <div className="set-toggle-info">
                      <strong className="set-toggle-title">Push notifications</strong>
                      <span className="set-toggle-desc">
                        Receive Echoo alerts in supported browsers and apps.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Push notifications"
                      aria-checked={pushNotifications}
                      className={`set-toggle ${pushNotifications ? 'set-toggle-on' : ''}`}
                      onClick={() => {
                        setPushNotifications((value) => !value);
                        setDirty(true);
                      }}
                    >
                      <span className="set-toggle-thumb" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {toast.open && (
        <div className="set-toast" role="status">
          <span className="set-toast-icon">
            {toast.title === 'Settings saved' ? <FaCheck /> : <FaInfoCircle />}
          </span>
          <div className="set-toast-body">
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button type="button" className="set-toast-close" onClick={() => setToast((t) => ({ ...t, open: false }))} aria-label="Close">
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default ListenerSettingsConnected;
