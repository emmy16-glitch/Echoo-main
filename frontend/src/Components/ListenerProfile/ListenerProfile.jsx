import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiLogOut, FiUser } from 'react-icons/fi';
import { api } from '../../services/api';
import { useGuestAuth } from '../Auth/GuestAuthGate';

export default function ListenerProfile() {
  const navigate = useNavigate();
  const { isGuest, requestAuth } = useGuestAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { /* No saved identity. */ }
  const links = [['Settings', '/listen/settings'], ['Privacy Policy', '/privacy-policy'], ['Delete account', '/delete-account'], ['Help and support', '/listen/settings?section=help']];
  const signOut = async () => {
    if (pending) return;
    setPending(true);
    try { await api.auth.logout(); localStorage.setItem('echooActiveExperience', 'listener'); navigate('/listen', { replace: true }); }
    catch { setError('Could not sign out. Try again.'); }
    finally { setPending(false); }
  };
  return <div className="listener-v2-page listener-profile-page">
    <header className="listener-v2-page-title"><h1>Profile</h1></header>
    <section className="listener-v2-panel listener-profile-card">
      <span className="listener-profile-avatar" aria-hidden="true"><FiUser /></span>
      <div className="listener-profile-copy">
        <h2>{isGuest ? 'Welcome to Echoo' : user.displayName || user.username || 'Your account'}</h2>
        {!isGuest && user.email && <p>{user.email}</p>}
      </div>
      {isGuest && <button className="listener-profile-primary" type="button" onClick={() => requestAuth({ action: 'Open Profile', destination: '/listen/profile' })}>Sign in</button>}
    </section>
    <div className="listener-profile-links">{links.map(([label, path]) => <button type="button" key={label} onClick={() => navigate(path)}><span>{label}</span><FiChevronRight aria-hidden="true" /></button>)}</div>
    {!isGuest && (
      <button className="listener-profile-signout" type="button" onClick={signOut} disabled={pending}>
        <FiLogOut aria-hidden="true" />
        <span>{pending ? 'Signing out…' : 'Sign out'}</span>
      </button>
    )}
    {error && <p className="listener-profile-error" role="alert">{error}</p>}
  </div>;
}
