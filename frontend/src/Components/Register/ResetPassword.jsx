import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaEye, FaEyeSlash, FaLock } from 'react-icons/fa';

import api from '../../services/api';
import LoadingButton from '../UI/LoadingButton';
import BroadcastLoginVisual from './BroadcastLoginVisual';
import EchooLogoImage from '../Assets/echoo-logo-official.svg';
import './auth-reference.css';

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const PasswordField = ({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  error = false,
}) => (
  <div className="ear-field">
    <div className="ear-field-label-row">
      <label htmlFor={id}>{label}</label>
    </div>
    <div className={`ear-input-shell ${error ? 'has-error' : ''}`}>
      <FaLock className="ear-input-icon" aria-hidden="true" />
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        required
      />
      <button
        type="button"
        className="ear-password-toggle"
        onClick={onToggle}
        aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-pressed={visible}
      >
        {visible ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
      </button>
    </div>
  </div>
);

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordValid = useMemo(() => passwordPattern.test(password), [password]);
  const passwordsMatch = password === confirmPassword;
  const confirmMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const backToSignIn = () => navigate('/?mode=login', { replace: true });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      setError('This reset link is invalid or incomplete.');
      return;
    }
    if (!passwordValid) {
      setError('Password must be at least 8 characters and include uppercase and lowercase letters, a number, and a special character.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.auth.resetPassword({ token, password });
      setNotice(response?.data?.message || 'Password reset successfully.');
      window.setTimeout(backToSignIn, 900);
    } catch (requestError) {
      setError(requestError?.message || 'This reset link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="echoo-auth-reference is-recovery">
      <section className="ear-visual-panel" aria-label="About your Echoo account">
        <BroadcastLoginVisual logoSrc={EchooLogoImage} mode="login" />
      </section>

      <section className="ear-auth-panel" aria-labelledby="echoo-reset-title">
        <div className="ear-auth-card">
          <button type="button" className="ear-back" onClick={backToSignIn}>
            <FaArrowLeft aria-hidden="true" /> Back to sign in
          </button>

          <header className="ear-form-heading">
            <h1 id="echoo-reset-title">Choose a new password</h1>
            <p>Use a strong password you have not used for your Echoo account before.</p>
          </header>

          <form className="ear-form" onSubmit={handleSubmit} noValidate>
            <PasswordField
              id="echoo-reset-password"
              label="New password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError('');
              }}
              visible={showPassword}
              onToggle={() => setShowPassword((current) => !current)}
              error={password.length > 0 && !passwordValid}
            />

            <PasswordField
              id="echoo-reset-confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                setError('');
              }}
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((current) => !current)}
              error={confirmMismatch}
            />

            {!passwordValid && password.length > 0 && (
              <p className="ear-error" role="alert">
                Use 8+ characters with uppercase and lowercase letters, a number, and a special character.
              </p>
            )}
            {confirmMismatch && <p className="ear-error" role="alert">Passwords do not match.</p>}
            {!token && <p className="ear-error" role="alert">This reset link is invalid or incomplete.</p>}
            {error && <p className="ear-error" role="alert">{error}</p>}
            {notice && <p className="ear-notice" role="status">{notice}</p>}

            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Updating password..."
              disabled={!passwordValid || !passwordsMatch || !token}
              className="ear-submit"
            >
              Update password <FaArrowRight aria-hidden="true" />
            </LoadingButton>
          </form>
        </div>
      </section>
    </main>
  );
};

export default ResetPassword;
