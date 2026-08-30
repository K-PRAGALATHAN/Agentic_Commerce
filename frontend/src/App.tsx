import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { AppShell } from './components/AppShell.js';
import { Login } from './pages/Login.js';
import { Home } from './pages/Home.js';
import { Cart } from './pages/Cart.js';
import { Orders } from './pages/Orders.js';
import { Settings } from './pages/Settings.js';
import { Merchant } from './pages/Merchant.js';
import { MerchantCollections } from './pages/merchant/Collections.js';
import { MerchantInventory } from './pages/merchant/Inventory.js';
import { MerchantCustomers } from './pages/merchant/Customers.js';
import { MerchantDiscounts } from './pages/merchant/Discounts.js';
import { MerchantAnalytics } from './pages/merchant/Analytics.js';
import { Observability } from './pages/Observability.js';

const TITLES: Record<string, string> = {
  '/': 'Home', '/cart': 'Cart', '/orders': 'Orders', '/merchant': 'Products',
  '/merchant/collections': 'Collections', '/merchant/inventory': 'Inventory',
  '/merchant/customers': 'Customers', '/merchant/discounts': 'Discounts',
  '/analytics': 'Analytics', '/audit': 'Audit trail', '/settings': 'Settings',
};

export function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="sp-auth"><span className="muted">Loading…</span></div>;
  if (!user) return <Login />;

  const isMerchant = user.roles.includes('merchant') || user.roles.includes('admin');

  // Merchants run a store, customers shop. The route sets differ so the pages the
  // nav hides aren't still reachable by typing a URL.
  return (
    <AppShell title={TITLES[location.pathname] ?? 'Agentic Commerce'}>
      <Routes>
        <Route path="/orders" element={<Orders />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/audit" element={<Observability />} />
        {isMerchant ? (
          <>
            <Route path="/merchant" element={<Merchant />} />
            {/* The assistant takes over the centre; Products sits behind it. */}
            <Route path="/chat" element={<Merchant />} />
            <Route path="/merchant/collections" element={<MerchantCollections />} />
            <Route path="/merchant/inventory" element={<MerchantInventory />} />
            <Route path="/merchant/customers" element={<MerchantCustomers />} />
            <Route path="/merchant/discounts" element={<MerchantDiscounts />} />
            <Route path="/analytics" element={<MerchantAnalytics />} />
            <Route path="*" element={<Navigate to="/merchant" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Home />} />
            {/* /chat keeps working — it opens the docked assistant over the storefront. */}
            <Route path="/chat" element={<Home />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </AppShell>
  );
}
