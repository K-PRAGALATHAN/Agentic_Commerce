import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { Login } from './pages/Login.js';
import { Home } from './pages/Home.js';
import { ChatShop } from './pages/ChatShop.js';
import { Cart } from './pages/Cart.js';
import { Orders } from './pages/Orders.js';
import { Settings } from './pages/Settings.js';
import { Merchant } from './pages/Merchant.js';
import { Observability } from './pages/Observability.js';

export function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <div className="container">Loading…</div>;
  if (!user) return <Login />;

  // The conversational shopping screen is a full-bleed app shell (its own sidebar).
  if (location.pathname === '/chat') return <ChatShop />;

  const isMerchant = user.roles.includes('merchant') || user.roles.includes('admin');

  return (
    <>
      <nav className="nav glass">
        <span className="brand">🛒 Agentic Commerce</span>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/chat">AI</NavLink>
        <NavLink to="/cart">Cart</NavLink>
        <NavLink to="/orders">Orders</NavLink>
        {isMerchant && <NavLink to="/merchant">Merchant</NavLink>}
        <NavLink to="/audit">Audit</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <span className="spacer" />
        <span className="pill">{user.email}</span>
        <button className="ghost" onClick={logout}>Logout</button>
      </nav>
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={<Observability />} />
          {isMerchant && <Route path="/merchant" element={<Merchant />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </>
  );
}
