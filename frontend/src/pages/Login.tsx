import { useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { I } from '../lib/icons.js';

type Mode = 'login' | 'signup' | 'forgot';

export function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // forgot-password state
  const [devToken, setDevToken] = useState('');
  const [token, setToken] = useState('');
  const [newPass, setNewPass] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'signup') await signup(email, password, role);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      const r = await api.post<{ message: string; devToken?: string }>('/auth/forgot-password', { email });
      setInfo(r.message);
      if (r.devToken) { setDevToken(r.devToken); setToken(r.devToken); } // dev convenience: prefill
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: newPass });
      setInfo('✓ Password reset. You can sign in now.');
      setMode('login'); setPassword(''); setDevToken(''); setToken(''); setNewPass('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const link = (m: Mode, label: string) => (
    <a onClick={() => { setMode(m); setErr(''); setInfo(''); }} style={{ color: 'var(--accent)', cursor: 'pointer' }}>{label}</a>
  );

  return (
    <div className="sp-auth">
    <div className="auth-wrap">
      <div className="sp-auth-brand">
        <span className="sp-brand-mark">{I.bag()}</span>
        <span className="sp-brand-name">Agentic Commerce</span>
      </div>

      {mode !== 'forgot' && (
        <>
          <p className="muted" style={{ marginTop: -6 }}>{mode === 'login' ? 'Sign in to continue' : 'Create an account'}</p>
          <form onSubmit={submit}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {mode === 'signup' && (
              <>
                <label>Account type</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="customer">Customer (buyer)</option>
                  <option value="merchant">Merchant (seller)</option>
                </select>
              </>
            )}
            {err && <p className="badge-bad">{err}</p>}
            {info && <p className="badge-ok">{info}</p>}
            <button disabled={busy} style={{ width: '100%', marginTop: 8 }}>
              {busy ? '…' : mode === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          </form>
          <p className="muted" style={{ textAlign: 'center', marginTop: 14 }}>
            {mode === 'login'
              ? <>No account? {link('signup', 'Sign up')} · {link('forgot', 'Forgot password?')}</>
              : <>Have an account? {link('login', 'Sign in')}</>}
          </p>
        </>
      )}

      {mode === 'forgot' && (
        <>
          <p className="muted" style={{ marginTop: -6 }}>Reset your password</p>
          <form onSubmit={requestReset}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="ghost" disabled={busy} style={{ width: '100%' }}>Send reset token</button>
          </form>
          {info && <p className="badge-ok">{info}</p>}
          {devToken && <p className="muted" style={{ fontSize: 12 }}>Dev token (emailed in production): <code>{devToken.slice(0, 24)}…</code></p>}
          <form onSubmit={doReset} style={{ marginTop: 10 }}>
            <label>Reset token</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} required />
            <label>New password (min 6)</label>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} />
            {err && <p className="badge-bad">{err}</p>}
            <button disabled={busy} style={{ width: '100%' }}>Reset password</button>
          </form>
          <p className="muted" style={{ textAlign: 'center', marginTop: 14 }}>{link('login', '← Back to sign in')}</p>
        </>
      )}
    </div>
    </div>
  );
}
