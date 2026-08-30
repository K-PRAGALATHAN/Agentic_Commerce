import { useEffect, useState } from 'react';
import { api, rupees } from '../../lib/api.js';

interface Point { day: string; paise: number; orders: number; }
interface Data {
  summary: { grossPaise: number; orders: number; paidOrders: number; aovPaise: number; conversionPct: number; unitsSold: number };
  salesOverTime: Point[];
  topProducts: { productId: string; name: string; units: number; paise: number }[];
  lowStock: { variantId: string; name: string; variantTitle: string; stock: number; sku: string }[];
  days: number;
}

const RANGES = [7, 30, 90];

// One series, so no legend — the title names it. Colour carries no meaning here;
// magnitude is read from height and bar length.
const SERIES = '#005bd3';

function SalesChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 720, h = 200, padL = 8, padB = 22;
  const max = Math.max(1, ...points.map((p) => p.paise));
  const step = points.length > 1 ? (w - padL * 2) / (points.length - 1) : 0;
  const x = (i: number) => padL + i * step;
  const y = (v: number) => (h - padB) - (v / max) * (h - padB - 10);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.paise).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - padB} L${x(0).toFixed(1)},${h - padB} Z`;
  const active = hover === null ? null : points[hover];

  return (
    <div className="an-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Sales over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * w;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round((rel - padL) / (step || 1)))));
        }}>
        <defs>
          <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity="0.18" />
            <stop offset="100%" stopColor={SERIES} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* recessive baseline; no gridlines — the tooltip carries exact values */}
        <line x1={padL} y1={h - padB} x2={w - padL} y2={h - padB} stroke="#e3e3e3" strokeWidth="1" />
        <path d={area} fill="url(#sales-fill)" />
        <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <>
            <line x1={x(hover)} y1={10} x2={x(hover)} y2={h - padB} stroke="#8a8a8a" strokeWidth="1" strokeDasharray="3 3" />
            {/* 2px surface ring keeps the marker readable over the fill */}
            <circle cx={x(hover)} cy={y(points[hover].paise)} r="5" fill={SERIES} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      <div className="an-chart-foot">
        <span>{points[0]?.day}</span>
        {active
          ? <strong>{active.day} · {rupees(active.paise)} · {active.orders} order{active.orders === 1 ? '' : 's'}</strong>
          : <span className="muted">Hover for a day</span>}
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}

export function MerchantAnalytics() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    let live = true;
    api.get<Data>(`/merchant/analytics?days=${days}`).then((r) => { if (live) setD(r); }).catch(() => {});
    return () => { live = false; };
  }, [days]);

  if (!d) return <p className="muted">Loading analytics…</p>;
  const s = d.summary;
  const topMax = Math.max(1, ...d.topProducts.map((p) => p.paise));

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Analytics</h1>
          <span className="muted">Sales of your products, last {d.days} days</span>
        </div>
        <div className="an-range">
          {RANGES.map((r) => (
            <button key={r} className={`ghost ${r === days ? 'on' : ''}`} onClick={() => setDays(r)}>{r}d</button>
          ))}
        </div>
      </div>

      {/* Headline numbers are hero figures, not charts — there is nothing to compare. */}
      <div className="an-tiles">
        <div className="an-tile"><span>Gross sales</span><strong>{rupees(s.grossPaise)}</strong></div>
        <div className="an-tile"><span>Paid orders</span><strong>{s.paidOrders}</strong></div>
        <div className="an-tile"><span>Average order value</span><strong>{rupees(s.aovPaise)}</strong></div>
        <div className="an-tile"><span>Conversion</span><strong>{s.conversionPct}%</strong>
          <em className="muted">{s.paidOrders} paid of {s.orders}</em></div>
      </div>

      <div className="list-row glass">
        <strong>Total sales over time</strong>
        <SalesChart points={d.salesOverTime} />
      </div>

      <div className="an-two">
        <div className="list-row glass">
          <strong>Top products</strong>
          {!d.topProducts.length && <p className="muted">No paid sales in this period.</p>}
          {d.topProducts.map((p) => (
            <div key={p.productId} className="an-bar-row">
              <span className="an-bar-label" title={p.name}>{p.name}</span>
              <span className="an-bar-track">
                <span className="an-bar" style={{ width: `${Math.max(2, (p.paise / topMax) * 100)}%`, background: SERIES }} />
              </span>
              <span className="an-bar-val">{rupees(p.paise)}</span>
            </div>
          ))}
        </div>

        <div className="list-row glass">
          <strong>Low stock</strong>
          {!d.lowStock.length && <p className="muted">Nothing running low.</p>}
          {d.lowStock.map((l) => (
            <div key={l.variantId} className="row between an-low">
              <span>{l.name}{l.variantTitle !== 'Default' && <span className="muted"> · {l.variantTitle}</span>}</span>
              <span className={`pill ${l.stock === 0 ? 'badge-bad' : ''}`}>{l.stock} left</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
