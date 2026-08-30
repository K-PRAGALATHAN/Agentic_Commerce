import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

interface Order { id: string; totalPaise: number; status: string; createdAt: string; items: any[]; }
interface Item { productId: string; name: string; qty: number; pricePaise: number; }
interface Sale { id: string; buyerEmail: string; status: string; createdAt: string; items: Item[]; myTotalPaise: number; }

const statusClass = (s: string) =>
  s === 'paid' ? 'badge-ok' : s === 'failed' ? 'badge-bad' : 'muted';

// One route, two meanings: a customer sees what they bought, a merchant sees
// what sold. They are different questions, so they get different tables.
export function Orders() {
  const { user } = useAuth();
  const isMerchant = !!(user?.roles.includes('merchant') || user?.roles.includes('admin'));
  return isMerchant ? <MerchantSales /> : <MyPurchases />;
}

// ---------------------------------------------------------------- merchant
function MerchantSales() {
  const [sales, setSales] = useState<Sale[] | null>(null);

  useEffect(() => {
    api.get<{ orders: Sale[] }>('/merchant/orders')
      .then((r) => setSales(r.orders))
      .catch(() => setSales([]));
  }, []);

  const paid = sales?.filter((s) => s.status === 'paid') ?? [];
  const revenue = paid.reduce((sum, s) => sum + s.myTotalPaise, 0);

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Orders</h1>
          <span className="muted">Sales of your products</span>
        </div>
        {!!paid.length && (
          <div style={{ textAlign: 'right' }}>
            <div className="price" style={{ fontSize: 18 }}>{rupees(revenue)}</div>
            <span className="muted">from {paid.length} paid order{paid.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      {sales === null && <p className="muted">Loading sales…</p>}
      {sales?.length === 0 && (
        <div className="list-row glass mp-empty">
          <strong>No sales yet</strong>
          <p className="muted">When a customer buys one of your products, the order appears here.</p>
        </div>
      )}

      {!!sales?.length && (
        <div className="glass mp-tablewrap">
          <table className="mp-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th className="num">Your revenue</th></tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} style={{ cursor: 'default' }}>
                  <td>
                    <code>{s.id.slice(0, 8)}</code>
                    <div className="muted mp-cat">{new Date(s.createdAt).toLocaleString()}</div>
                  </td>
                  <td>{s.buyerEmail}</td>
                  <td>
                    {s.items.map((i) => (
                      <div key={i.productId} className="mp-name" title={i.name}>
                        {i.qty} × {i.name}
                      </div>
                    ))}
                  </td>
                  <td><span className={`pill ${statusClass(s.status)}`}>{s.status}</span></td>
                  <td className="num price">{rupees(s.myTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        Revenue counts only your own line items, so an order shared with another merchant never
        shows their earnings.
      </p>
    </>
  );
}

// ---------------------------------------------------------------- customer
function MyPurchases() {
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
      <div className="sp-page-head">
        <div>
          <h1>Orders</h1>
          <span className="muted">What you've bought</span>
        </div>
      </div>

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
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
