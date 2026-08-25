import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { AppShell } from './components/AppShell.js';
import { Login } from './pages/Login.js';
import { Home } from './pages/Home.js';
import { ChatShop } from './pages/ChatShop.js';
import { Cart } from './pages/Cart.js';
import { Orders } from './pages/Orders.js';
import { Settings } from './pages/Settings.js';
import { Merchant } from './pages/Merchant.js';
import { Observability } from './pages/Observability.js';

const TITLES: Record<string, string> = {
  '/': 'Shop', '/cart': 'Cart', '/orders': 'Orders', '/merchant': 'Merchant', '/audit': 'Audit', '/settings': 'Settings',
};

export function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="container">Loading…</div>;
  if (!user) return <Login />;

  // The conversational shopping screen carries its own full-bleed shell (chat main + drawer).
  if (location.pathname === '/chat') return <ChatShop />;

  const isMerchant = user.roles.includes('merchant') || user.roles.includes('admin');

  return (
    <AppShell title={TITLES[location.pathname] ?? 'Agentic Commerce'}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/audit" element={<Observability />} />
        {isMerchant && <Route path="/merchant" element={<Merchant />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AppShell>
  );
}
