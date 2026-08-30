import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';
import type { PanelKind } from './SidePanel.js';

interface Props {
  chatOpen: boolean;
  panel: PanelKind | null;
  onToggleChat: () => void;
  onTogglePanel: (kind: PanelKind) => void;
}

// Black global bar. The assistant opens in the centre; account and activity
// open in the right side panel.
export function TopBar({ chatOpen, panel, onToggleChat, onTogglePanel }: Props) {
  const nav = useNavigate();
  const { user } = useAuth();
  const isMerchant = !!(user?.roles.includes('merchant') || user?.roles.includes('admin'));
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/⌘ + K focuses search, matching the hint chips.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A merchant searches their own products; a customer searches the storefront.
  const homePath = isMerchant ? '/merchant' : '/';
  function submit(e: React.FormEvent) {
    e.preventDefault();
    nav(q.trim() ? `${homePath}?q=${encodeURIComponent(q.trim())}` : homePath);
  }

  const name = (user?.email ?? '').split('@')[0] || 'Guest';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <header className="sp-topbar">
      <div className="sp-brand" onClick={() => nav(homePath)}>
        <span className="sp-brand-mark">{I.bag()}</span>
        <span className="sp-brand-name">Agentic</span>
      </div>

      <form className="sp-search" onSubmit={submit}>
        {I.search()}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isMerchant ? 'Search your products' : 'Search products'}
          aria-label="Search products"
        />
        <span className="sp-kbd"><span>CTRL</span><span>K</span></span>
      </form>

      <div className="sp-top-right">
        {/* Both roles get an assistant. They are different agents behind the
            same button: the merchant's has no cart and no way to buy. */}
        <button
          className={`sp-top-btn ${chatOpen ? 'on' : ''}`}
          onClick={onToggleChat}
          title={isMerchant ? 'Store assistant' : 'Shopping assistant'}
          aria-pressed={chatOpen}
          aria-label="Toggle assistant"
        >
          {I.sparkle()}
        </button>
        <button
          className={`sp-top-btn ${panel === 'notifications' ? 'on' : ''}`}
          onClick={() => onTogglePanel('notifications')}
          title="Activity"
          aria-pressed={panel === 'notifications'}
          aria-label="Activity"
        >
          {I.bell()}
        </button>
        <button
          className={`sp-store ${panel === 'account' ? 'on' : ''}`}
          onClick={() => onTogglePanel('account')}
          aria-pressed={panel === 'account'}
          title={user?.email}
        >
          <span className="sp-store-av">{initials}</span>
          <span className="sp-store-name">{name}</span>
        </button>
      </div>
    </header>
  );
}
