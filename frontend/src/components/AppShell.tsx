import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { AiPanel } from './AiPanel.js';
import { SidePanel, type PanelKind } from './SidePanel.js';
import { newConvo, upsertConvo } from '../lib/conversations.js';
import { cartsChanged } from '../lib/cartEvents.js';
import { useAuth } from '../lib/auth.js';

// Shell for every screen. Two surfaces swap independently:
//   centre  — the storefront page, or the assistant when it's open
//   right   — account or activity, opened from the top bar
export function AppShell({ children }: { title?: string; children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  const isMerchant = !!(user?.roles.includes('merchant') || user?.roles.includes('admin'));

  const [cartCount, setCartCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(loc.pathname === '/chat');
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [convoId, setConvoId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const refreshCart = useCallback(() => {
    if (isMerchant) return; // a merchant has no cart
    // Badge counts the universal cart; the broadcast tells Cart/Home to re-read
    // ALL carts, since the assistant may have created or emptied one.
    api.get<any>('/cart')
      .then(({ cart }) => setCartCount(cart.items.reduce((s: number, i: any) => s + i.qty, 0)))
      .catch(() => {})
      .finally(() => cartsChanged());
  }, [isMerchant]);

  useEffect(() => { refreshCart(); }, [refreshCart, loc.pathname]);

  // /chat is a shortcut that opens the assistant in the centre.
  useEffect(() => { if (loc.pathname === '/chat') setChatOpen(true); }, [loc.pathname]);

  const notify = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }, []);

  // Navigating to any page closes the assistant, so the centre shows that page.
  function leaveChat() {
    setChatOpen(false);
    if (loc.pathname === '/chat') nav(isMerchant ? '/merchant' : '/');
  }

  function openConvo(id: string) { setConvoId(id); setChatOpen(true); }
  function startConvo() {
    const c = newConvo(user?.id, isMerchant);
    if (user) upsertConvo(user.id, c);
    setConvoId(c.id); setChatOpen(true);
  }

  return (
    <div className="sp-app">
      <TopBar
        chatOpen={chatOpen}
        panel={panel}
        onToggleChat={() => (chatOpen ? leaveChat() : setChatOpen(true))}
        onTogglePanel={(k) => setPanel((cur) => (cur === k ? null : k))}
      />

      <div className="sp-body">
        <Sidebar
          cartCount={cartCount}
          chatOpen={chatOpen}
          onNavigate={leaveChat}
          onOpenConvo={openConvo}
          onNewConvo={startConvo}
        />

        <main className="sp-main">
          {chatOpen ? (
            <AiPanel
              isMerchant={isMerchant}
              convoId={convoId}
              onConvoChange={setConvoId}
              onClose={leaveChat}
              onCartChanged={refreshCart}
              notify={notify}
            />
          ) : (
            <div className="sp-page">{children}</div>
          )}
        </main>

        {panel && <SidePanel kind={panel} onClose={() => setPanel(null)} />}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
