import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import LoadingButton from '../UI/LoadingButton';
import EchooLogoImage from '../Assets/creator-logo.png';
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
      window.setTimeout(() => navigate('/', { replace: true }), 900);
    } catch (requestError) {
      setError(requestError?.message || 'This reset link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card compact-card">
        <div className="logo-container">
          <img src={EchooLogoImage} alt="Echoo Logo" className="echoo-logo-image" />
        </div>
        <div className="auth-header forgot-header">
          <h1>Reset Password</h1>
          <p>Choose a new password for your Echoo account.</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form compact-form" noValidate>
          <div className="input-container">
            <div className="input">
              <input
                className="forminput"
                type="password"
                placeholder="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="input-container">
            <div className="input">
              <input
                className="forminput"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          {error && <p className="eor-inline-error" role="alert">{error}</p>}
          {notice && <p className="eor-notice" role="status">{notice}</p>}
          <LoadingButton type="submit" loading={loading} loadingText="Updating..." disabled={!passwordValid || !passwordsMatch || !token} className="main-button">
            Update password
          </LoadingButton>
          <button type="button" className="back-button" onClick={() => navigate('/', { replace: true })}>
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
