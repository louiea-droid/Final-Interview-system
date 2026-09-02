'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Incorrect password.');
      setSubmitting(false);
      return;
    }

    const destination = searchParams.get('from') || '/admin';
    router.replace(destination);
    router.refresh();
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src="/visual/HILLC-Petals.png" alt="Hyacinth logo" />

        <h1 className="login-title">Admin Sign In</h1>
        <p className="login-subtitle">Enter the admin password to continue.</p>

        <div className="form-group">
          <label className="form-label" htmlFor="admin-password">
            Password
          </label>

          <input
            id="admin-password"
            className="form-input"
            type="password"
            required
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && <div className="message-box login-error">{error}</div>}

        <button type="submit" className="primary-button login-submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
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
