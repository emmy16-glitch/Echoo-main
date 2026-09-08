/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isAuthenticated } from '../../services/guestSession';
import './GuestAuthGate.css';

const GuestAuthContext = createContext({ requestAuth: () => false, isGuest: true });

export const useGuestAuth = () => useContext(GuestAuthContext);

export function GuestAuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const resumeRef = useRef(null);
  const [prompt, setPrompt] = useState(null);

  const requestAuth = useCallback(({ title, message, action, resume, destination } = {}) => {
    if (isAuthenticated()) {
      void resume?.();
      return true;
    }
    resumeRef.current = resume || null;
    setPrompt({
      title: title || 'Keep listening with an Echoo account',
      message: message || 'Create an account to save this across devices.',
      action: action || 'Continue',
      destination: destination || `${location.pathname}${location.search}`,
    });
    return false;
  }, [location.pathname, location.search]);

  const completeAuthentication = useCallback(async () => {
    const resume = resumeRef.current;
    const destination = prompt?.destination || '/listen';
    resumeRef.current = null;
    setPrompt(null);
    navigate(destination, { replace: true });
    if (resume) await resume();
  }, [navigate, prompt?.destination]);

  const begin = (mode) => {
    const target = prompt?.destination || '/listen';
    navigate(`/${mode}?returnTo=${encodeURIComponent(target)}`);
    setPrompt(null);
  };

  return (
    <GuestAuthContext.Provider value={{ requestAuth, completeAuthentication, isGuest: !isAuthenticated() }}>
      {children}
      {prompt && (
        <section className="echoo-guest-auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="echoo-guest-auth-title">
          <div className="echoo-guest-auth-sheet">
            <p className="echoo-guest-auth-kicker">{prompt.action}</p>
            <h2 id="echoo-guest-auth-title">{prompt.title}</h2>
            <p>{prompt.message}</p>
            <div className="echoo-guest-auth-actions">
              <button type="button" className="echoo-guest-auth-primary" onClick={() => begin('register')}>Sign up</button>
              <button type="button" className="echoo-guest-auth-secondary" onClick={() => begin('login')}>Sign in</button>
            </div>
            <button type="button" className="echoo-guest-auth-dismiss" onClick={() => setPrompt(null)}>Maybe later</button>
          </div>
        </section>
      )}
    </GuestAuthContext.Provider>
  );
}
