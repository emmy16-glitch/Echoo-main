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
      setEmailNotifications(Boolean(notifications.email));
      setPushNotifications(Boolean(notifications.push));
      setLocation(profile.location || '');
      setWebsite(profile.website || '');
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
    setDirty(true);
  }, [displayName, bio, language, emailNotifications, pushNotifications]);

  const save = async () => {
    if (saving) return;
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
          {nav !== 'profile' ? (
            <div className="set-panel set-panel-coming">
              <h2>{NAV_GROUPS.find((g) => g.id === nav)?.label || 'Settings'}</h2>
              <p>
                This section is managed through your account profile for now.
              </p>
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
                        onClick={() =>
                          notify('Photo uploads are managed from your profile page.', false)
                        }
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
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your display name"
                    />
                  </div>

                  <div className="set-field">
                    <label className="set-label" htmlFor="set-username">Username</label>
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
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell listeners a little about yourself…"
                    />
                  </div>

                  <div className="set-field">
                    <label className="set-label" htmlFor="set-location">Location</label>
                    {location ? (
                      <div className="set-readonly">{location}</div>
                    ) : (
                      <div className="set-readonly set-readonly-empty">Not set</div>
                    )}
                  </div>

                  <div className="set-field">
                    <label className="set-label" htmlFor="set-website">Website</label>
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
                        onChange={(e) => setLanguage(e.target.value)}
                      >
                        {LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                      <FaChevronDown className="set-select-chevron" />
                    </div>
                  </div>

                  <div className="set-toggle-row">
                    <div className="set-toggle-info">
                      <strong className="set-toggle-title">Content recommendations</strong>
                      <span className="set-toggle-desc">
                        Get personalized recommendations based on your listening.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailNotifications}
                      className={`set-toggle ${emailNotifications ? 'set-toggle-on' : ''}`}
                      onClick={() => setEmailNotifications((v) => !v)}
                    >
                      <span className="set-toggle-thumb" />
                    </button>
                  </div>

                  <div className="set-toggle-row">
                    <div className="set-toggle-info">
                      <strong className="set-toggle-title">Autoplay next</strong>
                      <span className="set-toggle-desc">
                        Automatically play the next item in a series.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pushNotifications}
                      className={`set-toggle ${pushNotifications ? 'set-toggle-on' : ''}`}
                      onClick={() => setPushNotifications((v) => !v)}
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
