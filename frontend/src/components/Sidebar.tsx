import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';
import { listConvos, newConvo, upsertConvo } from '../lib/conversations.js';

export function Sidebar() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();
  const isMerchant = user?.roles.includes('merchant') || user?.roles.includes('admin');

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('cs_collapsed') === '1'; } catch { return false; }
  });
  const [chatsOpen, setChatsOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((c) => { const n = !c; try { localStorage.setItem('cs_collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  }

  const name = (user?.email ?? '').split('@')[0] || 'Guest';
  const initial = name.charAt(0).toUpperCase();

  const item = (icon: keyof typeof I, label: string, to: string) => (
    <div className={`cs-nav-item ${loc.pathname === to ? 'active' : ''}`} onClick={() => nav(to)} title={label}>
      {I[icon]()}<span>{label}</span>
    </div>
  );

  function openChats() {
    if (collapsed) { nav('/chat'); return; }
    setChatsOpen((o) => !o);
  }
  function pickChat(id: string) { nav(`/chat?c=${id}`); setChatsOpen(false); }
  function startChat() { const c = newConvo(); if (user) upsertConvo(user.id, c); nav(`/chat?c=${c.id}`); setChatsOpen(false); }

  const convos = chatsOpen && user ? listConvos(user.id) : [];

  return (
    <aside className={`cs-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="cs-brand">
        <div className="cs-avatar" onClick={toggleCollapsed} title={name}>{initial}</div>
        <span className="cs-name">{name}</span>
        <span className="cs-toggle" onClick={toggleCollapsed} title="Collapse">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
        </span>
      </div>

      <nav className="cs-nav">
        <div className={`cs-nav-item ${loc.pathname === '/chat' ? 'active' : ''}`} onClick={openChats} title="Chats">
          {I.chats()}<span>Chats</span>
          {!collapsed && <span className="cs-caret">{chatsOpen ? '▾' : '▸'}</span>}
        </div>
        {chatsOpen && !collapsed && (
          <div className="cs-chats-drop">
            <div className="cs-chat-new" onClick={startChat}>+ New chat</div>
            {convos.length === 0 && <div className="cs-chat-empty">No chats yet</div>}
            {convos.map((c) => (
              <div key={c.id} className="cs-chat-hist" onClick={() => pickChat(c.id)} title={c.title}>{c.title}</div>
            ))}
          </div>
        )}
        {item('shop', 'Shop', '/')}
        {item('cart', 'Cart', '/cart')}
        {item('orders', 'Orders', '/orders')}
        {isMerchant && item('merchant', 'Merchant', '/merchant')}
        {item('audit', 'Audit', '/audit')}
        {item('gear', 'Settings', '/settings')}
      </nav>

      <div className="cs-side-foot">
        <div className="cs-nav-item" onClick={logout} title="Logout">{I.logout()}<span>Logout</span></div>
      </div>
    </aside>
  );
}
