import { useAuth } from '../lib/auth.js';
import { rupees } from '../lib/api.js';

export function Settings() {
  const { user } = useAuth();
  const limit = Number(user?.attributes?.spend_limit_paise ?? 0);

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

      <div className="title" style={{ fontSize: 16 }}>Agent buying preferences</div>
      <p className="muted" style={{ marginTop: -6 }}>These drive the guardrails — editable + enforced in Phase 2.</p>

      <div className="list-row glass">
        <label>Spend limit (per session)</label>
        <input value={rupees(limit)} disabled />
      </div>
      <div className="list-row glass">
        <label>Buying mode</label>
        <select disabled defaultValue="conversational">
          <option value="direct">Direct — act after first prompt</option>
          <option value="conversational">Conversational — ask before buying</option>
        </select>
      </div>
      <div className="list-row glass">
        <label>Ranking preference</label>
        <select disabled defaultValue="default">
          <option value="cost">Cost-efficient</option>
          <option value="quality">Quality</option>
          <option value="default">Default</option>
        </select>
      </div>
    </>
  );
}
