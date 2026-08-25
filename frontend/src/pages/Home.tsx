import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';

interface Product {
  id: string; name: string; pricePaise: number; category: string; rating: number; image: string;
}

export function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { products } = await api.get<{ products: Product[] }>(`/catalog?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    setProducts(products);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addToCart(id: string, name: string) {
    try {
      await api.post('/cart/items', { productId: id, qty: 1 });
      setMsg(`Added "${name}" to cart`);
      setTimeout(() => setMsg(''), 1800);
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <>
      <div className="row between">
        <div className="title">Storefront</div>
        <div className="row" style={{ width: 320 }}>
          <input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="ghost" onClick={load}>Search</button>
        </div>
      </div>
      {loading ? <p className="muted">Loading catalog…</p> : (
        <div className="grid">
          {products.map((p) => (
            <div key={p.id} className="card glass">
              {p.image ? <img className="thumb" src={p.image} alt="" /> : <div className="thumb" />}
              <div className="cat">{p.category}</div>
              <h3>{p.name}</h3>
              <div className="row between">
                <span className="price">{rupees(p.pricePaise)}</span>
                <span className="muted">★ {Number(p.rating).toFixed(1)}</span>
              </div>
              <button style={{ width: '100%', marginTop: 10 }} onClick={() => addToCart(p.id, p.name)}>Add to cart</button>
            </div>
          ))}
          {!products.length && <p className="muted">No products. A merchant can seed the catalog from the Merchant tab.</p>}
        </div>
      )}
      {msg && <div className="toast glass">{msg}</div>}
    </>
  );
}
