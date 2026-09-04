import { useRef, useState } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '../components/ToastProvider';
import { signIn } from '../lib/localAuth';

/*
 * Signs in against the ADMIN_USERNAME / ADMIN_PASSWORD in .env.local.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /*
   * State lands on the next render, so several submits fired in one tick
   * would all still see `submitting` as false. A ref flips immediately and
   * is what actually keeps the sign-in from being spammed; the state is
   * only there to drive the disabled styling.
   */
  const inFlight = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();

    // a disabled button still leaves Enter able to resubmit the form
    if (inFlight.current) return;

    inFlight.current = true;
    setSubmitting(true);

    try {
      await signIn(username, password);
    } catch (error) {
      /*
       * signIn already declines to say which of the two was wrong; its
       * message is shown as-is so a missing configuration reads as such
       * rather than as a rejected password.
       */
      showToast.error(error.message);
      inFlight.current = false;
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
      {/* ---------------- left: what the system is for ---------------- */}

      <aside className="login-hero" aria-hidden="true">
        <video
          className="login-hero-video"
          src="/visual/bg.mp4"
          autoPlay
          muted
          loop
          playsInline
        />

        <div className="login-hero-veil" />

        <div className="login-hero-content">
          <img
            className="login-hero-logo"
            src="/visual/logo.png"
            alt="Hyacinth Holdings"
          />
        </div>
      </aside>

      {/* ---------------- right: the sign-in ---------------- */}

      <main className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1 className="login-title">ADMIN LOGIN</h1>

          <p className="login-subtitle">
            Admin login for the announcement display.
          </p>

          <div className="form-group">
            <label className="form-label" htmlFor="admin-username">
              Username
            </label>

            <div className="login-field">
              <span className="login-field-icon">
                <User size={17} />
              </span>

              <input
                id="admin-username"
                className="form-input"
                type="text"
                required
                autoFocus
                autoComplete="username"
                disabled={submitting}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="admin-password">
              Password
            </label>

            <div className="login-field password-input-wrapper">
              <span className="login-field-icon">
                <Lock size={17} />
              </span>

              <input
                id="admin-password"
                className="form-input"
                type={passwordVisible ? 'text' : 'password'}
                required
                autoComplete="current-password"
                disabled={submitting}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button
                type="button"
                className="password-visibility-button"
                disabled={submitting}
                onClick={() => setPasswordVisible((current) => !current)}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="primary-button login-submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </main>

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
