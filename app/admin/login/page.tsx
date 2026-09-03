'use client';

import { FormEvent, Suspense, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Incorrect username or password.');
      setSubmitting(false);
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const destination = searchParams.get('from') || '/admin';
    router.replace(destination);
    router.refresh();
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

        {error && <div className="message-box login-error">{error}</div>}

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

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
