import { useEffect, useState } from 'react';
import {
  FaBell,
  FaCamera,
  FaCheck,
  FaEnvelope,
  FaHeadphones,
  FaLock,
  FaSave,
  FaShieldAlt,
  FaUser,
} from 'react-icons/fa';

import settingsService from '../../services/settingsService';
import { buildMediaUrl } from '../../services/api';
import '../../styles/listener-reference-pages.css';

const CATEGORIES = [
  'Faith & Spirituality','Education','News & Politics','Business','Health & Wellness',
  'Entertainment','Technology','Sports','Music','Comedy','Storytelling','Other',
];

const prepareImage = (file) => new Promise((resolve,reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the selected image.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not process the selected image.'));
    image.onload = () => {
      const maxSize = 420;
      const scale = Math.min(1,maxSize / Math.max(image.width,image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      resolve(canvas.toDataURL('image/jpeg',.76));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const ListenerSettings = () => {
  const [tab,setTab] = useState('profile');
  const [settings,setSettings] = useState(null);
  const [profile,setProfile] = useState({ displayName:'', bio:'', avatar:'' });
  const [preferences,setPreferences] = useState({ language:'en', theme:'light', categories:[] });
  const [notifications,setNotifications] = useState({ email:true,push:true,newFollowers:true,newReleases:true });
  const [emailForm,setEmailForm] = useState({ email:'',password:'' });
  const [passwordForm,setPasswordForm] = useState({ currentPassword:'',newPassword:'',confirmPassword:'' });
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

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
          displayName:data.profile?.displayName || '',
          bio:data.profile?.bio || '',
          avatar:buildMediaUrl(data.profile?.avatar || '') || '',
        });
        setEmailForm({ email:data.profile?.email || '', password:'' });
        setPreferences({
          language:data.preferences?.language || 'en',
          theme:'light',
          categories:Array.isArray(data.preferences?.categories) ? data.preferences.categories : [],
        });
        setNotifications({
          email:data.preferences?.notifications?.email !== false,
          push:data.preferences?.notifications?.push !== false,
          newFollowers:data.preferences?.notifications?.newFollowers !== false,
          newReleases:data.preferences?.notifications?.newReleases !== false,
        });
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load settings.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  },[]);

  const run = async (name,action,success) => {
    try {
      setBusy(name); setError(''); setMessage('');
      const result = await action();
      setMessage(success);
      return result;
    } catch (actionError) {
      setError(actionError?.message || 'Could not save this setting.');
      return null;
    } finally { setBusy(''); }
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
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
    const result = await run('profile',() => settingsService.updateProfile(profile),'Profile updated.');
    if (result?.data?.profile) {
      const saved = result.data.profile;
      setProfile((current) => ({
        ...current,
        displayName:saved.displayName || current.displayName,
        bio:saved.bio ?? current.bio,
        avatar:buildMediaUrl(saved.avatar || current.avatar) || '',
      }));
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const nextUser = { ...user, ...saved };
        localStorage.setItem('user',JSON.stringify(nextUser));
        window.dispatchEvent(new CustomEvent('echoo-profile-updated',{ detail:nextUser }));
      } catch { /* backend remains authoritative */ }
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    await run('preferences',() => settingsService.updatePreferences({ ...preferences, theme:'light' }),'Listening preferences updated.');
  };
  const saveNotifications = async (event) => {
    event.preventDefault();
    await run('notifications',() => settingsService.updateNotifications(notifications),'Notification settings updated.');
  };
  const saveEmail = async (event) => {
    event.preventDefault();
    const result = await run('email',() => settingsService.updateEmail(emailForm),'Email updated.');
    if (result) setEmailForm((current) => ({ ...current,password:'' }));
  };
  const savePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    const result = await run('password',() => settingsService.updatePassword(passwordForm),'Password updated.');
    if (result) setPasswordForm({ currentPassword:'',newPassword:'',confirmPassword:'' });
  };
  const toggleCategory = (category) => setPreferences((current) => ({
    ...current,
    categories:current.categories.includes(category)
      ? current.categories.filter((item) => item !== category)
      : [...current.categories,category],
  }));

  if (loading) {
    return <main className="echoo-reference-page ref-settings-page"><div className="ref-state-card"><strong>Loading your settings...</strong></div></main>;
  }

  return (
    <main className="echoo-reference-page ref-settings-page">
      <header className="ref-page-heading ref-settings-heading">
        <div><span className="ref-kicker">SETTINGS</span><h1>Your Echoo settings</h1><p>Profile, listening preferences, notifications and account security are saved to your real Echoo account.</p></div>
      </header>

      {message && <div className="ref-inline-success">{message}</div>}
      {error && <div className="ref-inline-error">{error}</div>}

      <div className="ref-settings-layout">
        <nav className="ref-settings-nav" aria-label="Settings sections">
          {[
            ['profile',<FaUser />,'Profile','Your public listener identity'],
            ['listening',<FaHeadphones />,'Listening','Topics and recommendations'],
            ['notifications',<FaBell />,'Notifications','Follower and broadcast updates'],
            ['account',<FaShieldAlt />,'Account & Security','Email and password'],
          ].map(([key,icon,label,copy]) => (
            <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setMessage(''); setError(''); }}>
              <span>{icon}</span><div><strong>{label}</strong><small>{copy}</small></div>
            </button>
          ))}
        </nav>

        <section className="ref-settings-content">
          {tab === 'profile' && (
            <form className="ref-settings-card" onSubmit={saveProfile}>
              <header><span><FaUser /></span><div><h2>Profile</h2><p>How you appear to creators and other Echoo listeners.</p></div></header>
              <div className="ref-settings-profile-photo">
                <label htmlFor="listener-settings-avatar">
                  {profile.avatar ? <img src={profile.avatar} alt="Profile preview" /> : <FaUser />}
                  <span><FaCamera /></span>
                </label>
                <input id="listener-settings-avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleAvatarChange} />
                <div><strong>Profile photo</strong><small>JPG, PNG or WebP. Max 10 MB.</small><label htmlFor="listener-settings-avatar">Choose photo</label></div>
              </div>
              <div className="ref-form-grid one">
                <label><span>Display name</span><input value={profile.displayName} maxLength={100} onChange={(event) => setProfile((current) => ({ ...current,displayName:event.target.value }))} /></label>
                <label><span>Bio</span><textarea value={profile.bio} maxLength={500} onChange={(event) => setProfile((current) => ({ ...current,bio:event.target.value }))} /></label>
              </div>
              <footer><button type="submit" className="ref-primary-action" disabled={busy === 'profile'}><FaSave /> {busy === 'profile' ? 'Saving...' : 'Save profile'}</button></footer>
            </form>
          )}

          {tab === 'listening' && (
            <form className="ref-settings-card" onSubmit={savePreferences}>
              <header><span><FaHeadphones /></span><div><h2>Listening preferences</h2><p>Choose the real content categories Echoo can use to shape recommendations.</p></div></header>
              <div className="ref-settings-categories">
                {CATEGORIES.map((category) => (
                  <button type="button" key={category} className={preferences.categories.includes(category) ? 'selected' : ''} onClick={() => toggleCategory(category)}>
                    {preferences.categories.includes(category) && <FaCheck />} {category}
                  </button>
                ))}
              </div>
              <div className="ref-settings-note"><FaCheck /><span>Echoo uses one consistent light product theme across creator and listener experiences.</span></div>
              <footer><button type="submit" className="ref-primary-action" disabled={busy === 'preferences'}><FaSave /> {busy === 'preferences' ? 'Saving...' : 'Save preferences'}</button></footer>
            </form>
          )}

          {tab === 'notifications' && (
            <form className="ref-settings-card" onSubmit={saveNotifications}>
              <header><span><FaBell /></span><div><h2>Notifications</h2><p>Only controls backed by Echoo notification events are shown here.</p></div></header>
              <div className="ref-settings-toggle-list">
                <label><div><strong>New followers</strong><span>Know when another Echoo account follows you.</span></div><input type="checkbox" checked={Boolean(notifications.newFollowers)} onChange={(event) => setNotifications((current) => ({ ...current,newFollowers:event.target.checked }))} /></label>
                <label><div><strong>New audio & live broadcasts</strong><span>Get updates when creators you follow publish audio or go live.</span></div><input type="checkbox" checked={Boolean(notifications.newReleases)} onChange={(event) => setNotifications((current) => ({ ...current,newReleases:event.target.checked }))} /></label>
              </div>
              <footer><button type="submit" className="ref-primary-action" disabled={busy === 'notifications'}><FaSave /> {busy === 'notifications' ? 'Saving...' : 'Save notifications'}</button></footer>
            </form>
          )}

          {tab === 'account' && (
            <div className="ref-settings-account-stack">
              <form className="ref-settings-card" onSubmit={saveEmail}>
                <header><span><FaEnvelope /></span><div><h2>Email</h2><p>Your current password is required before Echoo changes the account email.</p></div></header>
                <div className="ref-form-grid two">
                  <label><span>Email</span><input type="email" value={emailForm.email} required onChange={(event) => setEmailForm((current) => ({ ...current,email:event.target.value }))} /></label>
                  <label><span>Current password</span><input type="password" value={emailForm.password} required onChange={(event) => setEmailForm((current) => ({ ...current,password:event.target.value }))} /></label>
                </div>
                <footer><button type="submit" className="ref-primary-action" disabled={busy === 'email'}><FaSave /> {busy === 'email' ? 'Saving...' : 'Update email'}</button></footer>
              </form>

              <form className="ref-settings-card" onSubmit={savePassword}>
                <header><span><FaLock /></span><div><h2>Password</h2><p>Changing your password protects the account and may invalidate older refresh sessions.</p></div></header>
                <div className="ref-form-grid three">
                  <label><span>Current password</span><input type="password" value={passwordForm.currentPassword} required onChange={(event) => setPasswordForm((current) => ({ ...current,currentPassword:event.target.value }))} /></label>
                  <label><span>New password</span><input type="password" minLength={6} value={passwordForm.newPassword} required onChange={(event) => setPasswordForm((current) => ({ ...current,newPassword:event.target.value }))} /></label>
                  <label><span>Confirm password</span><input type="password" minLength={6} value={passwordForm.confirmPassword} required onChange={(event) => setPasswordForm((current) => ({ ...current,confirmPassword:event.target.value }))} /></label>
                </div>
                <footer><button type="submit" className="ref-primary-action" disabled={busy === 'password'}><FaLock /> {busy === 'password' ? 'Updating...' : 'Update password'}</button></footer>
              </form>

              {settings?.privacy && <div className="ref-settings-status"><FaShieldAlt /><div><strong>Account status</strong><span>{settings.privacy.isActive ? 'Active' : 'Inactive'}</span></div></div>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default ListenerSettings;
