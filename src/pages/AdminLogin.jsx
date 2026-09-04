import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';

import { useToast } from '../components/ToastProvider';
import { auth } from '../lib/firebase';

/*
 * Firebase Auth identifies admins by email address. The field is still
 * labelled "username" so the sign-in screen reads the same as before.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, username, password);
    } catch {
      // deliberately not saying which of the two was wrong
      showToast('Incorrect username or password.');
      setSubmitting(false);
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 650));

    // RequireAuth records where the admin was headed before being bounced here
    const destination =
      location.state?.from ??
      new URLSearchParams(location.search).get('from') ??
      '/admin';

    navigate(destination, { replace: true });
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src="/visual/HILLC-Petals.png" alt="Hyacinth logo" />

        <h1 className="login-title">Admin Log in</h1>
        <p className="login-subtitle">
          Enter your username and password to continue.
        </p>

        <div className="form-group">
          <label className="form-label" htmlFor="admin-username">
            Username
          </label>

          <input
            id="admin-username"
            className="form-input"
            type="text"
            required
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="admin-password">
            Password
          </label>

          <div className="password-input-wrapper">
            <input
              id="admin-password"
              className="form-input"
              type={passwordVisible ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="password-visibility-button"
              onClick={() => setPasswordVisible((current) => !current)}
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              aria-pressed={passwordVisible}
            >
              {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button type="submit" className="primary-button login-submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      {submitting && (
        <div className="login-loading-screen" role="status" aria-live="polite">
          <img
            className="login-loading-logo"
            src="/visual/HILLC-Petals.png"
            alt=""
          />
          <span>Signing in...</span>
        </div>
      )}
    </div>
  );
}
