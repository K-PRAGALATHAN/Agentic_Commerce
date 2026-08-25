import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';

export function Sidebar() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();
  const isMerchant = user?.roles.includes('merchant') || user?.roles.includes('admin');

  const item = (icon: keyof typeof I, label: string, to: string) => (
    <div className={`cs-nav-item ${loc.pathname === to ? 'active' : ''}`} onClick={() => nav(to)}>
      {I[icon]()}<span>{label}</span>
    </div>
  );

  return (
    <aside className="cs-sidebar">
      <div className="cs-brand">
        <div className="cs-orb" />
        <span className="cs-toggle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg></span>
      </div>
      <nav className="cs-nav">
        {item('chats', 'Chats', '/chat')}
        {item('shop', 'Shop', '/')}
        {item('cart', 'Cart', '/cart')}
        {item('orders', 'Orders', '/orders')}
        {isMerchant && item('merchant', 'Merchant', '/merchant')}
        {item('audit', 'Audit', '/audit')}
        {item('gear', 'Settings', '/settings')}
      </nav>
      <div className="cs-side-foot">
        <div className="cs-side-user">{user?.email}</div>
        <div className="cs-nav-item" onClick={logout}>{I.logout()}<span>Logout</span></div>
      </div>
    </aside>
  );
}
