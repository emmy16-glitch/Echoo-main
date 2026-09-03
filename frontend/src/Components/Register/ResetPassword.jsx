import { useMemo, useState } from 'react';
import { FaArrowLeft, FaLock } from 'react-icons/fa';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import LoadingButton from '../UI/LoadingButton';
import SuccessState from '../UI/SuccessState';
import EchooLogoImage from '../Assets/echoo-logo-official.svg';
import BroadcastLoginVisual from './BroadcastLoginVisual';
import './register.css';

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordValid = useMemo(() => passwordPattern.test(password), [password]);
  const passwordsMatch = password === confirmPassword;

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
    } catch (requestError) {
      setError(requestError?.message || 'This reset link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="echoo-auth-reference is-login is-reset-password">
      <section className="ear-visual-panel" aria-label="Echoo audio background">
        <BroadcastLoginVisual logoSrc={EchooLogoImage} mode="login" />
      </section>

      <section className="ear-auth-panel" aria-labelledby="reset-password-title">
        <div className="ear-auth-card">
          {notice ? (
            <SuccessState
              title="Password updated"
              message="Your new password is ready. Return to Echoo and sign in."
              onContinue={() => navigate('/', { replace: true })}
              continueLabel="Back to login"
            />
          ) : (
            <>
              <button
                type="button"
                className="ear-glass-back"
                onClick={() => navigate('/', { replace: true })}
                aria-label="Back to login"
              >
                <FaArrowLeft />
              </button>
              <img src={EchooLogoImage} alt="" className="ear-login-card-logo" aria-hidden="true" />
              <header className="ear-form-heading">
                <h1 id="reset-password-title">Create new password</h1>
                <p>Choose a secure new password for your Echoo account.</p>
              </header>

              <form onSubmit={handleSubmit} className="ear-form" noValidate>
                <div className="ear-field">
                  <div className="ear-field-label-row">
                    <label htmlFor="echoo-reset-password">New password</label>
                  </div>
                  <div className="ear-input-shell">
                    <FaLock className="ear-input-icon" aria-hidden="true" />
                    <input
                      id="echoo-reset-password"
                      type="password"
                      placeholder="Enter new password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError('');
                      }}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <div className="ear-field">
                  <div className="ear-field-label-row">
                    <label htmlFor="echoo-reset-confirm">Confirm new password</label>
                  </div>
                  <div className="ear-input-shell">
                    <FaLock className="ear-input-icon" aria-hidden="true" />
                    <input
                      id="echoo-reset-confirm"
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setError('');
                      }}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <p className="ear-helper ear-helper-on-glass">
                  Use 8+ characters with uppercase and lowercase letters, a number, and a special character.
                </p>
                {error && <p className="ear-error" role="alert">{error}</p>}

                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText="Updating..."
                  disabled={!passwordValid || !passwordsMatch || !token}
                  className="ear-submit"
                >
                  Update password
                </LoadingButton>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default ResetPassword;
