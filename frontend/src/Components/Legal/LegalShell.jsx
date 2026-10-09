import { Link, useLocation, useNavigate } from 'react-router-dom';
import EchooLogoImage from '../Assets/echoo-logo-mark.png';
import './LegalPages.css';

export default function LegalShell({ eyebrow, title, updated, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const returnToSignup = location.state?.authReturnTo === '/register';

  return (
    <main className="echoo-legal-page">
      <header className="echoo-legal-topbar">
        <Link className="echoo-legal-brand" to="/listen" aria-label="Echoo home">
          <img src={EchooLogoImage} alt="" />
          <span>Echoo</span>
        </Link>
        <nav className="echoo-legal-nav" aria-label="Legal pages">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/delete-account">Delete Account</Link>
        </nav>
      </header>

      <article className="echoo-legal-document">
        {returnToSignup && (
          <button
            type="button"
            className="echoo-legal-back"
            onClick={() => navigate('/register', { replace: true })}
          >
            Back to sign up
          </button>
        )}
        <div className="echoo-legal-heading">
          <p className="echoo-legal-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {updated ? <p className="echoo-legal-updated">Last updated: {updated}</p> : null}
        </div>
        {children}
      </article>

      <footer className="echoo-legal-footer">
        <span>Echoo</span><span aria-hidden="true">·</span>
        <Link to="/privacy-policy">Privacy Policy</Link><span aria-hidden="true">·</span>
        <Link to="/delete-account">Delete Account</Link>
      </footer>
    </main>
  );
}
