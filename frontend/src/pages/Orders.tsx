import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';

interface Order { id: string; totalPaise: number; status: string; createdAt: string; items: any[]; }

const statusClass = (s: string) => (s === 'paid' ? 'badge-ok' : s === 'failed' ? 'badge-bad' : s === 'refunded' ? 'muted' : 'muted');

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const r = await api.get<{ orders: Order[] }>('/orders');
    setOrders(r.orders);
  }
  useEffect(() => { load(); }, []);

  async function requestRefund(id: string) {
    try {
      await api.post(`/orders/${id}/refund/request`, { reason: 'requested from Orders' });
      setMsg('Refund requested — awaiting merchant approval (money-out is gated).');
      setTimeout(() => setMsg(''), 2600);
    } catch (e: any) { setMsg(e.message); }
  }

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
            {o.status === 'paid' && <button className="ghost" onClick={() => requestRefund(o.id)}>Request refund</button>}
          </div>
        </div>
      ))}
      {msg && <div className="toast glass">{msg}</div>}
    </>
  );
}
