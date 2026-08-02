'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { Role } from '@/lib/api/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteAdminPage() {
  const [form, setForm] = useState({ email: '', name: '' });
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState('');
  const [result, setResult] = useState<{ inviteUrl?: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // RBAC-07: the master admin assigns the role at invite time. If the roles
  // endpoint is unavailable the selector hides and the backend default applies.
  useEffect(() => {
    api.admin.getRoles()
      .then((r) => setRoles(r.filter((role) => !role.isSystem)))
      .catch(() => setRoles([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!email || !name) { setError('Both fields are required.'); return; }
    if (!EMAIL_RE.test(email)) { setError('Enter a valid email address.'); return; }
    setError(''); setLoading(true);
    try {
      const r = await api.post('/admin/invite', { name, email, roleId: roleId || undefined });
      setResult(r.data);
      setCopied(false);
      setForm({ email: '', name: '' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Failed to create the invite.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const link = result?.inviteUrl ?? '';
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — let the admin select the text manually
      setError('Could not copy automatically — select the link text and copy it manually.');
    }
  };

  return (
    <div className="invite-wrap">
      <div className="invite-card">
        <div className="invite-icon">✉️</div>
        <h2>Invite Admin</h2>
        <p>Invite a new admin: they receive an activation email, and you also get the link to share manually if needed. Invites expire after 48 hours.</p>

        {result ? (
          <div className="result-box" aria-live="polite">
            <div className="result-success">✓ Invite created!</div>
            <p className="result-note">Invitation email sent. You can also share the link directly:</p>
            <div className="invite-link-box">
              <code>{result.inviteUrl}</code>
              <button className="copy-btn" onClick={copyLink}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            {error && <div className="error-msg" role="alert">{error}</div>}
            <button className="btn-another" onClick={() => { setResult(null); setError(''); }}>Send another invite</button>
          </div>
        ) : (
          <form className="invite-form" onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="invite-name">Full Name</label>
              <input
                id="invite-name"
                className="form-input"
                placeholder="Jane Smith"
                autoComplete="off"
                value={form.name}
                onChange={(e) => { setError(''); setForm((f) => ({ ...f, name: e.target.value })); }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="invite-email">Email Address</label>
              <input
                id="invite-email"
                className="form-input"
                type="email"
                placeholder="jane@oxshare.com"
                autoComplete="off"
                value={form.email}
                onChange={(e) => { setError(''); setForm((f) => ({ ...f, email: e.target.value })); }}
              />
            </div>
            {roles.length > 0 && (
              <div className="form-group">
                <label htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  className="form-input"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                >
                  <option value="">Default (KYC review + client list)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && <div className="error-msg" role="alert">{error}</div>}
            <button className="submit-btn" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Creating invite...' : '📨 Create Invite'}
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .invite-wrap { min-height: 80vh; display: flex; align-items: center; justify-content: center; padding: 32px; }
        .invite-card {
          background: var(--card); border: 1px solid var(--input);
          border-radius: 24px; padding: 48px 40px; max-width: 480px; width: 100%; text-align: center;
        }
        .invite-icon { font-size: 3rem; margin-bottom: 20px; }
        h2 { font-size: 1.5rem; font-weight: 700; color: var(--foreground); margin-bottom: 10px; }
        p { color: var(--muted-foreground); font-size: 0.9rem; line-height: 1.6; margin-bottom: 28px; }

        .invite-form { text-align: left; }
        .form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
        label { font-size: 0.82rem; font-weight: 500; color: var(--muted-foreground); }
        .form-input {
          background: var(--background); border: 1px solid var(--input);
          border-radius: 10px; padding: 12px 16px; color: var(--foreground); font-size: 0.93rem; outline: none; width: 100%;
        }
        .form-input:focus { border-color: var(--ring); }
        .error-msg { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; padding: 10px 14px; color: #fca5a5; font-size: 0.83rem; margin-bottom: 14px; }
        .submit-btn {
          width: 100%; background: linear-gradient(135deg, var(--ring), #a78bfa);
          color: white; border: none; border-radius: 50px; padding: 14px;
          font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: all 0.2s;
        }
        .submit-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,130,255,0.35); }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .result-box { text-align: left; }
        .result-success { color: #4ade80; font-weight: 700; font-size: 1rem; margin-bottom: 12px; text-align: center; }
        .result-note { font-size: 0.85rem; color: var(--muted-foreground); margin-bottom: 12px !important; }
        .invite-link-box {
          background: var(--muted); border: 1px solid var(--input);
          border-radius: 10px; padding: 12px 16px; display: flex; align-items: center;
          gap: 12px; margin-bottom: 20px; word-break: break-all;
        }
        .invite-link-box code { flex: 1; color: var(--primary); font-size: 0.78rem; }
        .copy-btn { background: var(--muted); color: var(--primary); border: none; border-radius: 8px; padding: 6px 14px; font-size: 0.8rem; font-weight: 600; cursor: pointer; flex-shrink: 0; }
        .btn-another { width: 100%; background: var(--muted); color: var(--muted-foreground); border: 1px solid var(--input); border-radius: 50px; padding: 12px; font-size: 0.9rem; cursor: pointer; }
      `}</style>
    </div>
  );
}
