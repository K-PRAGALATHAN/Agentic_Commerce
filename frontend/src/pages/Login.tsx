import { useState } from 'react';
import { useAuth } from '../lib/auth.js';

export function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, role);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap glass">
      <div className="title" style={{ marginTop: 0 }}>🛒 Agentic Commerce</div>
      <p className="muted" style={{ marginTop: -6 }}>
        {mode === 'login' ? 'Sign in to continue' : 'Create an account'}
      </p>
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
        <button disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
      <p className="muted" style={{ textAlign: 'center', marginTop: 14 }}>
        {mode === 'login' ? 'No account?' : 'Have an account?'}{' '}
        <a onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{ color: 'var(--accent)', cursor: 'pointer' }}>
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </a>
      </p>
    </div>
  );
}
