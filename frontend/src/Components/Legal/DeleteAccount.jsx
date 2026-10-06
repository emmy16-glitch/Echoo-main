import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearAuthTokens } from '../../services/api';
import settingsService from '../../services/settingsService';
import LegalShell from './LegalShell';

const hasSession = () =>
  typeof window !== 'undefined' &&
  Boolean(localStorage.getItem('accessToken') || localStorage.getItem('token'));

export default function DeleteAccount() {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState('');
  const signedIn = hasSession();

  const submit = async (event) => {
    event.preventDefault();
    if (!password) return setError('Enter your current password.');
    if (!confirmed) return setError('Confirm that you understand this deletion is permanent.');

    try {
      setBusy(true);
      setError('');
      await settingsService.deleteAccount(password);
      clearAuthTokens();
      setPassword('');
      setDeleted(true);
    } catch (deleteError) {
      setError(
        deleteError?.code === 'INVALID_PASSWORD'
          ? 'That password is incorrect.'
          : deleteError?.message || 'Echoo could not delete this account. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalShell eyebrow="ECHOO · ACCOUNT" title="Delete your Echoo account">
      {deleted ? (
        <section className="echoo-delete-success" aria-live="polite">
          <h2>Account deleted</h2>
          <p>Your Echoo account record has been permanently deleted and this device has been signed out.</p>
          <Link className="echoo-legal-primary-link" to="/listen">Return to Echoo</Link>
        </section>
      ) : (
        <>
          <section className="echoo-legal-intro">
            <p>Deleting your account is permanent. Read what happens below before you continue.</p>
          </section>

          <section>
            <h2>What deletion does</h2>
            <ul>
              <li>removes the active Echoo account and profile record;</li>
              <li>ends your ability to sign in with that account; and</li>
              <li>signs this browser or app session out after the request succeeds.</li>
            </ul>
            <p>
              Some information can be retained where required for security, legal obligations, fraud prevention,
              backups or the integrity of previously published content and conversations. See the
              {' '}<Link to="/privacy-policy">Privacy Policy</Link> for details.
            </p>
          </section>

          <section>
            <h2>Before you continue</h2>
            <p>
              If you are a creator, save any recordings or information you need before deleting the account.
              Account deletion is not the same as signing out and cannot be undone through Echoo.
            </p>
          </section>

          {!signedIn ? (
            <section className="echoo-delete-auth-card">
              <h2>Sign in to continue</h2>
              <p>Echoo needs to verify that you own the account before it can be deleted.</p>
              <Link className="echoo-legal-primary-link" to="/login?returnTo=%2Fdelete-account">
                Sign in to delete account
              </Link>
            </section>
          ) : (
            <form className="echoo-delete-form" onSubmit={submit}>
              <h2>Confirm account deletion</h2>
              <label htmlFor="echoo-delete-password">Current password</label>
              <input
                id="echoo-delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <label className="echoo-delete-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={busy}
                />
                <span>I understand that deleting my Echoo account is permanent.</span>
              </label>
              {error ? <p className="echoo-delete-error" role="alert">{error}</p> : null}
              <button
                className="echoo-delete-button"
                type="submit"
                disabled={busy || !password || !confirmed}
              >
                {busy ? 'Deleting account…' : 'Permanently delete account'}
              </button>
            </form>
          )}
        </>
      )}
    </LegalShell>
  );
}
