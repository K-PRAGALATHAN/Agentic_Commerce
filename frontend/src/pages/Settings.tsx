import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';

interface Prefs { spendLimitPaise: number; buyingMode: string; rankingPref: string; rankingWeight: string; }

export function Settings() {
  const { user } = useAuth();

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [limitRupees, setLimitRupees] = useState('');
  const [prefMsg, setPrefMsg] = useState('');
  useEffect(() => {
    api.get<{ preferences: Prefs }>('/me/preferences').then((r) => {
      setPrefs(r.preferences);
      setLimitRupees(String(r.preferences.spendLimitPaise / 100));
    });
  }, []);

  async function savePrefs(patch: Partial<Prefs>) {
    const r = await api.put<{ preferences: Prefs }>('/me/preferences', patch);
    setPrefs(r.preferences);
    setPrefMsg('✓ Saved');
    setTimeout(() => setPrefMsg(''), 1500);
  }

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await api.post('/auth/change-password', { currentPassword: cur, newPassword: next });
      setMsg('✓ Password changed'); setCur(''); setNext('');
    } catch (e: any) {
      setMsg(e.message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="title">Settings</div>
      <div className="list-row glass">
        <label>Email</label>
        <div>{user?.email}</div>
      </div>
      <div className="list-row glass">
        <label>Roles</label>
        <div className="row">{user?.roles.map((r) => <span key={r} className="pill">{r}</span>)}</div>
      </div>

      <div className="title" style={{ fontSize: 16 }}>Change password</div>
      <div className="list-row glass">
        <form onSubmit={changePassword}>
          <label>Current password</label>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required />
          <label>New password (min 6)</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
          <div className="row">
            <button disabled={busy}>{busy ? '…' : 'Update password'}</button>
            {msg && <span className={msg.startsWith('✓') ? 'badge-ok' : 'badge-bad'}>{msg}</span>}
          </div>
        </form>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Changing your password only replaces your login credential — your account, orders, and history stay the same (they key on your user ID, not your password).
        </p>
      </div>

      <div className="title" style={{ fontSize: 16 }}>Agent buying preferences {prefMsg && <span className="badge-ok" style={{ fontSize: 13 }}>{prefMsg}</span>}</div>
      <p className="muted" style={{ marginTop: -6 }}>These bound + steer the agent — enforced by the guardrail before any purchase.</p>
      {prefs && (
        <>
          <div className="list-row glass">
            <label>Spend limit (₹)</label>
            <div className="row">
              <input type="number" min="1" value={limitRupees} onChange={(e) => setLimitRupees(e.target.value)} />
              <button onClick={() => savePrefs({ spendLimitPaise: Math.round(Number(limitRupees) * 100) })}>Save</button>
            </div>
          </div>
          <div className="list-row glass">
            <label>Buying mode</label>
            <select value={prefs.buyingMode} onChange={(e) => savePrefs({ buyingMode: e.target.value as any })}>
              <option value="direct">Direct — act after first prompt</option>
              <option value="conversational">Conversational — ask before buying</option>
            </select>
          </div>
          <div className="list-row glass">
            <label>Ranking preference</label>
            <select value={prefs.rankingPref} onChange={(e) => savePrefs({ rankingPref: e.target.value as any })}>
              <option value="cost">Cost-efficient</option>
              <option value="quality">Quality</option>
              <option value="default">Default</option>
            </select>
          </div>
        </>
      )}
    </>
  );
}
