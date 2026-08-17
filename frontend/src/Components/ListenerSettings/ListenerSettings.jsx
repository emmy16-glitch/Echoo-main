import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBell,
  FaCamera,
  FaCheck,
  FaEnvelope,
  FaLock,
  FaSave,
  FaUser,
} from 'react-icons/fa';

import settingsService from '../../services/settingsService';
import { buildMediaUrl } from '../../services/api';
import './ListenerSettings.css';

const CATEGORIES = [
  'Faith & Spirituality',
  'Education',
  'News & Politics',
  'Business',
  'Health & Wellness',
  'Entertainment',
  'Technology',
  'Sports',
  'Music',
  'Comedy',
  'Storytelling',
  'Other',
];

const prepareImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not process the selected image.'));
      image.onload = () => {
        const maxSize = 420;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.76));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const ListenerSettings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [profile, setProfile] = useState({ displayName: '', bio: '', avatar: '' });
  const [preferences, setPreferences] = useState({
    language: 'en',
    theme: 'system',
    categories: [],
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await settingsService.get();
        if (!active) return;

        const data = response?.data || {};
        setSettings(data);
        setProfile({
          displayName: data.profile?.displayName || '',
          bio: data.profile?.bio || '',
          avatar: buildMediaUrl(data.profile?.avatar || '') || '',
        });
        setEmailForm({
          email: data.profile?.email || '',
          password: '',
        });
        setPreferences({
          language: data.preferences?.language || 'en',
          theme: data.preferences?.theme || 'system',
          categories: Array.isArray(data.preferences?.categories)
            ? data.preferences.categories
            : [],
        });
        setNotifications({
          email: data.preferences?.notifications?.email !== false,
          push: data.preferences?.notifications?.push !== false,
          newFollowers: data.preferences?.notifications?.newFollowers !== false,
          newReleases: data.preferences?.notifications?.newReleases !== false,
        });
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Could not load settings.');
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
      const result = await action();
      setMessage(success);
      return result;
    } catch (actionError) {
      setError(actionError?.message || 'Could not save this setting.');
      return null;
    } finally {
      setBusy('');
    }
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose a JPG, PNG or WebP image.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Please choose an image smaller than 10 MB.');
      return;
    }

    try {
      const avatar = await prepareImage(file);
      setProfile((current) => ({ ...current, avatar }));
      setError('');
    } catch (imageError) {
      setError(imageError?.message || 'Could not process the selected image.');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const result = await run(
      'profile',
      () => settingsService.updateProfile(profile),
      'Profile updated.'
    );

    if (result?.data?.profile) {
      const savedProfile = result.data.profile;
      setProfile((current) => ({
        ...current,
        displayName: savedProfile.displayName || current.displayName,
        bio: savedProfile.bio ?? current.bio,
        avatar: buildMediaUrl(savedProfile.avatar || current.avatar) || '',
      }));

      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const nextUser = { ...user, ...savedProfile };
        localStorage.setItem('user', JSON.stringify(nextUser));
        if (savedProfile.avatar) {
          localStorage.setItem('profileImage', savedProfile.avatar);
        }
      } catch {
        // Backend remains authoritative if local cache update fails.
      }
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    await run(
      'preferences',
      () => settingsService.updatePreferences(preferences),
      'Listening preferences updated.'
    );
  };

  const saveNotifications = async (event) => {
    event.preventDefault();
    await run(
      'notifications',
      () => settingsService.updateNotifications(notifications),
      'Notification settings updated.'
    );
  };

  const saveEmail = async (event) => {
    event.preventDefault();
    const result = await run(
      'email',
      () => settingsService.updateEmail(emailForm),
      'Email updated.'
    );
    if (result) setEmailForm((current) => ({ ...current, password: '' }));
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const result = await run(
      'password',
      () => settingsService.updatePassword(passwordForm),
      'Password updated. Sign in again on other devices if required.'
    );
    if (result) {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
  };

  const toggleCategory = (category) => {
    setPreferences((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }));
  };

  if (loading) {
    return <main className="ls-page"><div className="ls-state">Loading settings...</div></main>;
  }

  return (
    <main className="ls-page">
      <button type="button" className="ls-back" onClick={() => navigate('/listen')}>
        <FaArrowLeft /> Home
      </button>

      <header className="ls-header">
        <span>SETTINGS</span>
        <h1>Your Echoo preferences.</h1>
        <p>These settings are stored in your real Echoo account.</p>
      </header>

      {message && <div className="ls-message success">{message}</div>}
      {error && <div className="ls-message error">{error}</div>}

      <div className="ls-grid">
        <form className="ls-card" onSubmit={saveProfile}>
          <div className="ls-card-title"><FaUser /><div><h2>Profile</h2><p>How you appear across Echoo.</p></div></div>

          <div className="ls-profile-photo-row">
            <label htmlFor="listener-avatar-input" className="ls-profile-photo" title="Choose profile photo">
              {profile.avatar ? <img src={profile.avatar} alt="Profile preview" /> : <FaUser />}
              <span><FaCamera /></span>
            </label>
            <input
              id="listener-avatar-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              hidden
            />
            <div>
              <strong>Profile photo</strong>
              <small>JPG, PNG or WebP. Max 10 MB.</small>
              <label htmlFor="listener-avatar-input" className="ls-photo-action">Choose photo</label>
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
              onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy === 'profile'}>
            <FaSave /> {busy === 'profile' ? 'Saving...' : 'Save profile'}
          </button>
        </form>

        <form className="ls-card" onSubmit={savePreferences}>
          <div className="ls-card-title"><FaHeadphonesIcon /><div><h2>Listening</h2><p>Topics used for real recommendations.</p></div></div>
          <div className="ls-category-grid">
            {CATEGORIES.map((category) => (
              <button
                type="button"
                key={category}
                className={preferences.categories.includes(category) ? 'selected' : ''}
                onClick={() => toggleCategory(category)}
              >
                {preferences.categories.includes(category) && <FaCheck />} {category}
              </button>
            ))}
          </div>
          <label>
            <span>Theme preference</span>
            <select
              value={preferences.theme}
              onChange={(event) => setPreferences((current) => ({ ...current, theme: event.target.value }))}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button type="submit" disabled={busy === 'preferences'}>
            <FaSave /> {busy === 'preferences' ? 'Saving...' : 'Save preferences'}
          </button>
        </form>

        <form className="ls-card" onSubmit={saveNotifications}>
          <div className="ls-card-title"><FaBell /><div><h2>Notifications</h2><p>Choose which Echoo updates you want.</p></div></div>
          {[
            ['push', 'In-app / push notifications'],
            ['email', 'Email notifications'],
            ['newFollowers', 'New follower notifications'],
            ['newReleases', 'New release and broadcast updates'],
          ].map(([key, label]) => (
            <label className="ls-toggle" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(notifications[key])}
                onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))}
              />
            </label>
          ))}
          <button type="submit" disabled={busy === 'notifications'}>
            <FaSave /> {busy === 'notifications' ? 'Saving...' : 'Save notifications'}
          </button>
        </form>

        <form className="ls-card" onSubmit={saveEmail}>
          <div className="ls-card-title"><FaEnvelope /><div><h2>Email</h2><p>Your account email requires your password to change.</p></div></div>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={emailForm.email}
              required
              onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label>
            <span>Current password</span>
            <input
              type="password"
              value={emailForm.password}
              required
              onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy === 'email'}>
            <FaSave /> {busy === 'email' ? 'Saving...' : 'Update email'}
          </button>
        </form>

        <form className="ls-card wide" onSubmit={savePassword}>
          <div className="ls-card-title"><FaLock /><div><h2>Password</h2><p>Changing it invalidates older refresh sessions.</p></div></div>
          <div className="ls-password-grid">
            <label>
              <span>Current password</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                required
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              />
            </label>
            <label>
              <span>New password</span>
              <input
                type="password"
                minLength={6}
                value={passwordForm.newPassword}
                required
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              />
            </label>
            <label>
              <span>Confirm new password</span>
              <input
                type="password"
                minLength={6}
                value={passwordForm.confirmPassword}
                required
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
            </label>
          </div>
          <button type="submit" disabled={busy === 'password'}>
            <FaLock /> {busy === 'password' ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>

      {settings?.privacy && (
        <p className="ls-footnote">
          Account status: {settings.privacy.isActive ? 'Active' : 'Inactive'}.
        </p>
      )}
    </main>
  );
};

const FaHeadphonesIcon = () => <span aria-hidden="true">◉</span>;

export default ListenerSettings;
