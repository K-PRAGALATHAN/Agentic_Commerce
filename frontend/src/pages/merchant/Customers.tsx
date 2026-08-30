import { useEffect, useState } from 'react';
import { api, rupees } from '../../lib/api.js';

interface Segment { key: string; name: string; count: number; description: string; }
interface Customer {
  userId: string; email: string; orders: number; paidOrders: number;
  spentPaise: number; firstOrderAt: string | null; lastOrderAt: string | null;
}

// Only these segments narrow the customer list; the other two are counts the
// backend derives differently (abandoned checkouts, registered accounts), so
// they're shown as figures rather than pretending to be filters.
const FILTERABLE = new Set(['once', 'repeat', 'never']);

export function MerchantCustomers() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [segment, setSegment] = useState<string>('');

  useEffect(() => { api.get<{ segments: Segment[] }>('/merchant/segments').then((r) => setSegments(r.segments)).catch(() => {}); }, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>(`/merchant/customers${segment ? `?segment=${segment}` : ''}`)
      .then((r) => setCustomers(r.customers)).catch(() => {});
  }, [segment]);

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Customers</h1>
          <span className="muted">People who have ordered your products</span>
        </div>
      </div>

      <div className="cs-segments">
        {segments.map((s) => {
          const filterable = FILTERABLE.has(s.key);
          const active = segment === s.key;
          return (
            <button
              key={s.key}
              className={`cs-seg ${active ? 'on' : ''} ${filterable ? '' : 'static'}`}
              onClick={() => filterable && setSegment(active ? '' : s.key)}
              title={s.description}
              disabled={!filterable}
            >
              <span className="cs-seg-n">{s.count}</span>
              <span className="cs-seg-name">{s.name}</span>
            </button>
          );
        })}
      </div>

      {segment && (
        <p className="muted">
          Filtered by <strong>{segments.find((s) => s.key === segment)?.name}</strong> ·{' '}
          <a onClick={() => setSegment('')} style={{ cursor: 'pointer' }}>clear</a>
        </p>
      )}

      <div className="glass mp-tablewrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Customer</th><th className="num">Orders</th><th className="num">Paid</th>
              <th className="num">Spent</th><th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.userId} style={{ cursor: 'default' }}>
                <td><div className="mp-name">{c.email}</div></td>
                <td className="num">{c.orders}</td>
                <td className="num">{c.paidOrders}</td>
                <td className="num price">{rupees(c.spentPaise)}</td>
                <td className="muted">{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {!customers.length && (
              <tr><td colSpan={5} className="muted">No customers in this view yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
