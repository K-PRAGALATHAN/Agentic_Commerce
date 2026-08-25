import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';

interface Order { id: string; totalPaise: number; status: string; createdAt: string; items: any[]; }

const statusClass = (s: string) => (s === 'paid' ? 'badge-ok' : s === 'failed' ? 'badge-bad' : 'muted');

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    api.get<{ orders: Order[] }>('/orders').then((r) => setOrders(r.orders));
  }, []);

  return (
    <>
      <div className="title">Orders</div>
      {!orders.length && <p className="muted">No orders yet.</p>}
      {orders.map((o) => (
        <div key={o.id} className="list-row glass row between">
          <div>
            <code>{o.id.slice(0, 8)}</code>
            <div className="muted">{new Date(o.createdAt).toLocaleString()} · {o.items?.length ?? 0} item(s)</div>
          </div>
          <div className="row">
            <span className="price">{rupees(o.totalPaise)}</span>
            <span className={`pill ${statusClass(o.status)}`}>{o.status}</span>
          </div>
        </div>
      ))}
    </>
  );
}
