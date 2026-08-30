import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

interface Collection { id: string; title: string; handle: string; description: string; productCount: number; }
interface Product { id: string; name: string; image: string; }
type Draft = { id?: string; title: string; description: string; productIds: string[] };

export function MerchantCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [msg, setMsg] = useState('');
  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2200); };

  async function load() {
    setCollections((await api.get<{ collections: Collection[] }>('/merchant/collections')).collections);
    setProducts((await api.get<{ products: Product[] }>('/merchant/products')).products);
  }
  useEffect(() => { load(); }, []);

  async function openEdit(c: Collection) {
    const { productIds } = await api.get<{ productIds: string[] }>(`/merchant/collections/${c.id}/products`);
    setEditing({ id: c.id, title: c.title, description: c.description, productIds });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body = { title: editing.title, description: editing.description, productIds: editing.productIds };
    try {
      if (editing.id) await api.put(`/merchant/collections/${editing.id}`, body);
      else await api.post('/merchant/collections', body);
      setEditing(null); say('Collection saved'); await load();
    } catch (err: any) { say(err.message); }
  }

  async function del(id: string) {
    try { await api.del(`/merchant/collections/${id}`); say('Collection deleted'); await load(); }
    catch (err: any) { say(err.message); }
  }

  const toggle = (pid: string) => setEditing((c) => !c ? c : ({
    ...c,
    productIds: c.productIds.includes(pid) ? c.productIds.filter((x) => x !== pid) : [...c.productIds, pid],
  }));

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Collections</h1>
          <span className="muted">{collections.length} collection{collections.length === 1 ? '' : 's'}</span>
        </div>
        <button onClick={() => setEditing({ title: '', description: '', productIds: [] })}>+ Add collection</button>
      </div>

      {!collections.length && (
        <div className="list-row glass mp-empty">
          <strong>Group products into collections</strong>
          <p className="muted">Collections organise the storefront and give the assistant a way to browse by theme.</p>
        </div>
      )}

      {collections.map((c) => (
        <div key={c.id} className="list-row glass row between">
          <div>
            <strong>{c.title}</strong> <code>{c.handle}</code>
            <div className="muted">
              {c.productCount} product{c.productCount === 1 ? '' : 's'}{c.description ? ` — ${c.description}` : ''}
            </div>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => openEdit(c)}>Edit</button>
            <button className="danger" onClick={() => del(c.id)}>Delete</button>
          </div>
        </div>
      ))}

      {editing && (
        <>
          <div className="mp-scrim" onClick={() => setEditing(null)} />
          <aside className="mp-drawer">
            <div className="mp-drawer-head">
              <strong>{editing.id ? 'Edit collection' : 'New collection'}</strong>
              <button className="sp-rail-btn" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            </div>
            <form className="mp-drawer-body" onSubmit={save}>
              <label>Title</label>
              <input value={editing.title} required onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <label>Description</label>
              <textarea rows={3} value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              <label>Products <span className="muted">({editing.productIds.length} selected)</span></label>
              <div className="mc-picker">
                {products.map((p) => (
                  <label key={p.id} className="mc-pick">
                    <input type="checkbox" checked={editing.productIds.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                  </label>
                ))}
                {!products.length && <span className="muted">Add products first.</span>}
              </div>
              <div className="mp-drawer-foot">
                <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit">Save collection</button>
              </div>
            </form>
          </aside>
        </>
      )}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
