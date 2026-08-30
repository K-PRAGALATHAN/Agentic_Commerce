import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';

export type PanelKind = 'account' | 'notifications';

interface AuditRow {
  id: number; actor: string; action: string; reason: string;
  amount_paise: number | null; verified: boolean | null; ts: string;
}
interface Prefs { spendLimitPaise: number; buyingMode: string; rankingPref: string; }

const ago = (ts: string) => {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(ts).toLocaleDateString();
};

// The right side panel. Account and activity open here, so the centre stays
// free for the storefront or the assistant.
export function SidePanel({ kind, onClose }: { kind: PanelKind; onClose: () => void }) {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (kind === 'notifications') {
      api.get<{ audit: AuditRow[] }>('/observability/audit')
        .then((r) => setAudit(r.audit.slice(0, 25)))
        .catch(() => setAudit([]));
    } else {
      api.get<{ preferences: Prefs }>('/me/preferences')
        .then((r) => setPrefs(r.preferences))
        .catch(() => {});
    }
  }, [kind]);

  const name = (user?.email ?? '').split('@')[0] || 'Guest';
  const go = (to: string) => { nav(to); onClose(); };

  return (
    <aside className="sp-rail">
      <div className="sp-rail-head">
        <span className="sp-rail-title">{kind === 'account' ? 'Account' : 'Activity'}</span>
        <button className="sp-rail-btn" onClick={onClose} title="Close" aria-label="Close panel">{I.close()}</button>
      </div>

      <div className="sp-panel-body">
        {kind === 'account' ? (
          <>
            <div className="sp-acct">
              <span className="sp-acct-av">{name.slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="sp-acct-name">{name}</div>
                <div className="sp-acct-mail">{user?.email}</div>
              </div>
            </div>
            <div className="sp-roles">
              {user?.roles.map((r) => <span key={r} className="pill">{r}</span>)}
            </div>

            <div className="sp-panel-label">Agent limits</div>
            {prefs ? (
              <div className="sp-facts">
                <div><span>Spend limit</span><b>{rupees(prefs.spendLimitPaise)}</b></div>
                <div><span>Buying mode</span><b>{prefs.buyingMode}</b></div>
                <div><span>Ranking</span><b>{prefs.rankingPref}</b></div>
              </div>
            ) : <p className="muted">Loading…</p>}

            <div className="sp-panel-actions">
              <button className="ghost" onClick={() => go('/settings')}>Settings</button>
              <button className="ghost" onClick={() => go('/orders')}>Your orders</button>
              <button className="danger" onClick={logout}>Log out</button>
            </div>
          </>
        ) : (
          <>
            <div className="sp-panel-label">Recent activity</div>
            {audit === null && <p className="muted">Loading…</p>}
            {audit?.length === 0 && <p className="muted">Nothing has happened yet.</p>}
            {audit?.map((a) => (
              <div key={a.id} className="sp-note">
                <div className="sp-note-top">
                  <span className="pill">{a.actor}</span>
                  <span className="sp-note-time">{ago(a.ts)}</span>
                </div>
                <div className="sp-note-action">
                  {a.action.replace(/_/g, ' ')}
                  {a.amount_paise != null && <b> · {rupees(Number(a.amount_paise))}</b>}
                </div>
                <div className="sp-note-reason">{a.reason}</div>
              </div>
            ))}
            {!!audit?.length && (
              <div className="sp-panel-actions">
                <button className="ghost" onClick={() => go('/audit')}>Open full audit trail</button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
