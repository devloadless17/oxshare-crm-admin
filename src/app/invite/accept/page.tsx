'use client';

import React, { useState, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';

function AcceptInviteContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Validating the token is a fetch, not an effect that assigns state. The old
  // version wrote the failure into the same `error` box the password form uses,
  // so a bad token and a bad password were indistinguishable.
  const validation = useQuery({
    queryKey: ['invite', token],
    queryFn: async () =>
      // `params`, not string interpolation: the token comes straight off the URL
      // bar, and axios encodes it correctly. Interpolating it meant a token
      // containing `&` or `#` silently arrived truncated, which reads as
      // "invalid invite" with nothing to explain why.
      (
        await api.get<{ email?: string; name?: string }>('/admin/invite/validate', {
          params: { token },
        })
      ).data,
    enabled: token !== '',
    retry: false,
  });

  const invite = validation.data ?? null;
  const validating = token !== '' && validation.isPending;
  const inviteError =
    token === ''
      ? 'Invalid invite link.'
      : validation.isError
        ? apiErrorMessage(validation.error, 'Invalid or expired invite.')
        : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/admin/invite/accept', { token, password });
      // Full navigation instead of router.push so AdminAuthContext boots fresh
      // with the new session; a client-side push renders the shell with admin: null.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/dashboard');
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Failed to accept invite.'));
      setLoading(false);
    }
  };

  return (
    <div className="accept-wrap">
      <div className="accept-card">
        {validating ? (
          <>
            <div className="spinner" />
            <p>Validating invite...</p>
          </>
        ) : inviteError ? (
          <>
            <div className="error-icon">⚠️</div>
            <h2>Invalid Invite</h2>
            <p>{inviteError}</p>
          </>
        ) : (
          <>
            <div className="welcome-icon">👋</div>
            <h2>Welcome, {invite?.name}!</h2>
            <p>
              You&apos;ve been invited to join OXShare Admin. Set your password to activate your
              account.
            </p>
            <div className="email-badge">{invite?.email}</div>

            <form className="form" onSubmit={(e) => void submit(e)}>
              <div className="form-group">
                <label htmlFor="new-password">New Password</label>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setError('');
                    setPassword(e.target.value);
                  }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="confirm-password">Confirm Password</label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setError('');
                    setConfirm(e.target.value);
                  }}
                />
              </div>
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide passwords' : 'Show passwords'}
              </button>
              {error && (
                <div className="error-msg" role="alert">
                  {error}
                </div>
              )}
              <button className="submit-btn" type="submit" disabled={loading} aria-busy={loading}>
                {loading ? 'Activating account...' : '🚀 Activate Account'}
              </button>
            </form>
          </>
        )}
      </div>

      <style jsx>{`
        .accept-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--background);
          padding: 20px;
        }
        .accept-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 48px 40px;
          max-width: 440px;
          width: 100%;
          text-align: center;
          animation: fadeIn 0.4s ease both;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
        }
        .spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto 20px;
          border: 3px solid var(--muted);
          border-top-color: var(--ring);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .error-icon,
        .welcome-icon {
          font-size: 3rem;
          margin-bottom: 16px;
        }
        h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 10px;
        }
        p {
          color: var(--muted-foreground);
          font-size: 0.9rem;
          line-height: 1.6;
          margin-bottom: 0;
        }
        .email-badge {
          display: inline-block;
          margin: 20px 0;
          background: color-mix(in srgb, var(--primary) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
          border-radius: 20px;
          padding: 6px 18px;
          color: var(--link);
          font-size: 0.85rem;
          font-weight: 600;
        }
        .form {
          text-align: left;
        }
        .form-group {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        label {
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--muted-foreground);
        }
        .form-input {
          background: var(--background);
          border: 1px solid var(--input);
          border-radius: 10px;
          padding: 12px 16px;
          color: var(--foreground);
          font-size: 0.93rem;
          outline: none;
          width: 100%;
        }
        .form-input:focus {
          border-color: var(--ring);
        }
        .form-input::placeholder {
          color: var(--muted-foreground);
        }
        .submit-btn:focus-visible,
        .toggle-visibility:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .toggle-visibility {
          background: none;
          border: none;
          color: var(--link);
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0;
          margin-bottom: 14px;
          text-align: left;
        }
        .toggle-visibility:hover {
          text-decoration: underline;
        }
        .error-msg {
          background: color-mix(in srgb, var(--destructive) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--destructive) 25%, transparent);
          border-radius: 10px;
          padding: 10px 14px;
          color: var(--destructive);
          font-size: 0.83rem;
          margin-bottom: 14px;
        }
        .submit-btn {
          width: 100%;
          background: var(--primary);
          color: var(--primary-foreground);
          border: none;
          border-radius: 50px;
          padding: 14px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          margin-top: 4px;
        }
        .submit-btn:hover {
          background: var(--primary-hover);
          transform: translateY(-1px);
          box-shadow: 0 8px 24px color-mix(in srgb, var(--primary) 35%, transparent);
        }
        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
          Loading invite parameters...
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
