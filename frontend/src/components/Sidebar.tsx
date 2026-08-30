import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';
import { listConvos, removeConvo, onConversationsChanged } from '../lib/conversations.js';

interface Props {
  cartCount: number;
  chatOpen: boolean;
  onNavigate: () => void;
  onOpenConvo: (id: string) => void;
  onNewConvo: () => void;
}

// Light left rail: primary nav, a collapsible assistant-conversation section,
// Settings pinned to the bottom above the mode card.
export function Sidebar({ cartCount, chatOpen, onNavigate, onOpenConvo, onNewConvo }: Props) {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, logout } = useAuth();
  const isMerchant = user?.roles.includes('merchant') || user?.roles.includes('admin');

  const [convosOpen, setConvosOpen] = useState(false);
  // The list is read from localStorage during render, so it only refreshes when
  // something re-renders this component. The panel writes to the same store, so
  // a bump counter driven by the shared event keeps the two in step.
  const [version, setVersion] = useState(0);
  useEffect(() => onConversationsChanged(() => setVersion((v) => v + 1)), []);
  const convos = convosOpen && user ? listConvos(user.id).slice(0, 8) : [];
  void version; // read so the dependency is explicit rather than incidental

  // While the assistant holds the centre, no page is showing — so nothing is active.
  const item = (icon: keyof typeof I, label: string, to: string, count?: number) => (
    <button
      className={`sp-nav-item ${!chatOpen && loc.pathname === to ? 'active' : ''}`}
      onClick={() => { onNavigate(); nav(to); }}
      title={label}
    >
      {I[icon]()}
      <span>{label}</span>
      {count ? <span className="sp-count">{count}</span> : null}
    </button>
  );

  const sub = (label: string, to: string) => (
    <button
      className={`sp-sub-item ${!chatOpen && loc.pathname === to ? 'on' : ''}`}
      onClick={() => { onNavigate(); nav(to); }}
    >
      {label}
    </button>
  );

  return (
    <aside className="sp-sidebar">
      {/* A merchant runs a store; a customer shops. They get different navigation —
          a merchant has no cart, and "Orders" means sales, not purchases. */}
      <nav className="sp-nav">
        {isMerchant ? (
          <>
            {item('products', 'Products', '/merchant')}
            {/* Sub-items, the way Shopify nests Collections and Inventory. */}
            <div className="sp-subnav">
              {sub('Collections', '/merchant/collections')}
              {sub('Inventory', '/merchant/inventory')}
            </div>
            {item('orders', 'Orders', '/orders')}
            {item('customers', 'Customers', '/merchant/customers')}
            {item('discount', 'Discounts', '/merchant/discounts')}
            {item('audit', 'Analytics', '/analytics')}
            {item('shop', 'Marketplace', '/stores')}
            {item('ledger', 'Audit trail', '/audit')}
          </>
        ) : (
          <>
            {item('home', 'Home', '/')}
            {item('shop', 'Stores', '/stores')}
            {item('orders', 'Orders', '/orders')}
            {item('cart', 'Cart', '/cart', cartCount)}
            {item('audit', 'Analytics', '/audit')}
          </>
        )}
      </nav>

      <div className="sp-section" onClick={() => setConvosOpen((o) => !o)}>
        <span>Assistant conversations</span>
        <span style={{ display: 'flex', transform: convosOpen ? 'rotate(90deg)' : 'none' }}>{I.chevronRight()}</span>
      </div>
      {convosOpen && (
        <div className="sp-sublist">
          <div className="sp-sub-item new" onClick={onNewConvo}>+ New conversation</div>
          {!convos.length && <div className="sp-sub-empty">No conversations yet</div>}
          {convos.map((c) => (
            <div key={c.id} className="sp-sub-item sp-sub-row" title={c.title}>
              <span onClick={() => onOpenConvo(c.id)}>{c.title}</span>
              <button
                className="sp-rail-del"
                title={`Delete "${c.title}"`}
                aria-label={`Delete conversation ${c.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  // removeConvo fires the shared event, which bumps `version`
                  // above and re-renders this list. The previous version toggled
                  // one piece of state twice, which React batches into a no-op.
                  if (user) removeConvo(user.id, c.id);
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="sp-side-foot">
        {item('gear', 'Settings', '/settings')}
        <button className="sp-nav-item" onClick={logout} title="Log out">
          {I.logout()}<span>Log out</span>
        </button>

        <div className="sp-side-card">
          <b>Test mode</b>
          <p>Payments run on Razorpay test keys — no real money moves.</p>
          <button onClick={() => { onNavigate(); nav('/settings'); }}>
            {isMerchant ? 'Store settings' : 'Manage spend limit'}
          </button>
        </div>
      </div>
    </aside>
  );
}
