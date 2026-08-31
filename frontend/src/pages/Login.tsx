import { useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { I } from '../lib/icons.js';
import panelUrl from '../assets/auth-panel.jpg';

type Mode = 'login' | 'signup' | 'forgot';

// The accounts the demo runs on. Printed on the page rather than kept in a
// README nobody opens mid-presentation — this is a test-mode store, and these
// credentials are meant to be shared with whoever is watching.
const DEMO = [
  { email: 'riya@demo.shop', label: 'Customer', hint: 'shops across all four stores' },
  { email: 'nova@demo.store', label: 'Merchant', hint: 'Nova Tech — electronics' },
];
const DEMO_PASSWORD = 'demo1234';

export function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [role, setRole] = useState('customer');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // forgot-password state
  const [devToken, setDevToken] = useState('');
  const [token, setToken] = useState('');
  const [newPass, setNewPass] = useState('');
  const [info, setInfo] = useState('');

  const go = (m: Mode) => { setMode(m); setErr(''); setInfo(''); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'signup') await signup(email, password, role);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  // One click fills the form and signs in. Typing an email and a password in
  // front of an audience is thirty seconds of nothing happening.
  async function useDemo(demoEmail: string) {
    setMode('login'); setErr('');
    setEmail(demoEmail); setPassword(DEMO_PASSWORD);
    setBusy(true);
    try { await login(demoEmail, DEMO_PASSWORD); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
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

  const heading =
    mode === 'signup' ? 'Create an account'
      : mode === 'forgot' ? 'Reset your password'
        : 'Welcome back';
  const sub =
    mode === 'signup'
      ? 'Buy across four stores, or open one of your own — it takes about a minute.'
      : mode === 'forgot'
        ? 'We will send a token to your email. In development it comes straight back and fills itself in below.'
        : 'Sign in to pick up your carts, orders and conversations where you left them.';

  return (
    <div className="lg">
      {/* Left: light falling through a curtain, and one sentence. Nothing to
          read and nothing to click, so the eye goes to the form. */}
      <aside className="lg-art">
        <div className="lg-mark">
          <span>{I.logo()}</span>
          <b>Agentic Commerce</b>
        </div>

        {/* A photograph beats a generated gradient here: it says "clothes,
            objects, a shop" in a way no amount of procedural silk could. The
            scrim over it is what keeps the copy readable — the image has a pale
            wall at the top and a busy rug at the bottom, and the headline sits
            on the busy end. */}
        <img className="lg-photo" src={panelUrl} alt="" />
        <div className="lg-scrim" aria-hidden="true" />

        <div className="lg-copy">
          <span>You can simply</span>
          <h2>Describe what you need and let the agent go and find it.</h2>
        </div>
      </aside>

      {/* Right: the form. */}
      <main className="lg-form">
        <div className="lg-inner">
          <h1>{heading}</h1>
          <p className="lg-sub">{sub}</p>

          {mode !== 'forgot' ? (
            <form onSubmit={submit}>
              <label htmlFor="lg-email">Your email</label>
              <input
                id="lg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />

              <label htmlFor="lg-pw">{mode === 'signup' ? 'Create password' : 'Password'}</label>
              <div className="lg-pw">
                <input
                  id="lg-pw"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  title={show ? 'Hide password' : 'Show password'}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? I.eyeOff() : I.eye()}
                </button>
              </div>

              {mode === 'signup' && (
                <>
                  <label htmlFor="lg-role">Account type</label>
                  <select id="lg-role" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="customer">Customer — buy from the stores</option>
                    <option value="merchant">Merchant — open a store</option>
                  </select>
                </>
              )}

              {mode === 'login' && (
                <div className="lg-forgot">
                  <a onClick={() => go('forgot')}>Forgot password?</a>
                </div>
              )}

              {err && <p className="badge-bad">{err}</p>}
              {info && <p className="badge-ok">{info}</p>}

              <button className="lg-go" disabled={busy}>
                {busy ? '…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={requestReset}>
                <label htmlFor="lg-remail">Your email</label>
                <input id="lg-remail" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required />
                <button className="lg-go ghosted" disabled={busy}>Send reset token</button>
              </form>
              {info && <p className="badge-ok">{info}</p>}
              {devToken && (
                <p className="lg-note">
                  Dev token (emailed in production): <code>{devToken.slice(0, 24)}…</code>
                </p>
              )}
              <form onSubmit={doReset}>
                <label htmlFor="lg-token">Reset token</label>
                <input id="lg-token" value={token} onChange={(e) => setToken(e.target.value)} required />
                <label htmlFor="lg-new">New password</label>
                <input id="lg-new" type="password" value={newPass}
                  onChange={(e) => setNewPass(e.target.value)} required minLength={6} />
                {err && <p className="badge-bad">{err}</p>}
                <button className="lg-go" disabled={busy}>Reset password</button>
              </form>
            </>
          )}

          {mode !== 'forgot' && (
            <>
              {/* Where the reference puts Google, GitHub and Apple. Ours are the
                  demo accounts: the same one-tap job, without three buttons that
                  claim an integration this project does not have. */}
              <div className="lg-or"><span>or continue as</span></div>
              <div className="lg-quick">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    disabled={busy}
                    title={`${d.email} — ${d.hint}`}
                    onClick={() => useDemo(d.email)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="lg-foot">
            {mode === 'signup'
              ? <>Already have an account? <a onClick={() => go('login')}>Sign in</a></>
              : mode === 'forgot'
                ? <><a onClick={() => go('login')}>← Back to sign in</a></>
                : <>New here? <a onClick={() => go('signup')}>Create an account</a></>}
          </p>
        </div>
      </main>
    </div>
  );
}
