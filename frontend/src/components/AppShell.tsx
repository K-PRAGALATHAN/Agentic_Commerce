import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { I } from '../lib/icons.js';
import { Sidebar } from './Sidebar.js';

// Shared app shell: dark sidebar + light rounded main + header. Wraps every page
// so the whole app matches the conversational-shopping design.
export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const nav = useNavigate();
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    api.get<any>('/cart').then(({ cart }) => setCartCount(cart.items.reduce((s: number, i: any) => s + i.qty, 0))).catch(() => {});
  }, []);
  return (
    <div className="cs-app">
      <Sidebar />
      <main className="cs-main">
        <header className="cs-header">
          <h1>{title}</h1>
          <span className="cs-cart" onClick={() => nav('/cart')}>{I.cartBig()}{cartCount > 0 && <span className="cs-cart-badge">{cartCount}</span>}</span>
        </header>
        <div className="cs-page app-light">{children}</div>
      </main>
    </div>
  );
}
