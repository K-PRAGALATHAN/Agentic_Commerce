import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiUpload, rupees } from '../lib/api.js';
import { I } from '../lib/icons.js';

interface Product {
  id: string; name: string; description: string; pricePaise: number;
  stock: number; category: string; image: string;
}
interface Refund { id: string; order_id: string; amount_paise: number; reason: string; requester_email: string; }
interface Cost { totalCalls: number; totalCost: number; byModel: any[]; }
interface WikiEntry { key: string; title: string; content: string; }
interface VariantRow { id?: string; title: string; priceRupees: string; stock: string; sku: string; }
interface StoreForm {
  storeName: string; tagline: string; about: string; logo: string; location: string; slug?: string;
}
const EMPTY_STORE: StoreForm = { storeName: '', tagline: '', about: '', logo: '', location: '' };

interface Payouts {
  account: { status: string; detail: string; razorpayAccountId: string | null } | null;
  balance: { totalPaise: number; settledPaise: number; pendingPaise: number; mode: string };
}

type Editor = null | { mode: 'create' } | { mode: 'edit'; id: string };
interface ProductForm { name: string; description: string; priceRupees: string; stock: string; category: string; image: string; }

const EMPTY: ProductForm = { name: '', description: '', priceRupees: '', stock: '0', category: '', image: '' };
const NEW_VARIANT = (): VariantRow => ({ title: '', priceRupees: '', stock: '0', sku: '' });
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 2_000_000;
const SLUG = /^[a-z0-9-]{1,40}$/;

// Product thumbnail with a graceful fallback — a missing or broken image must
// never render as a broken <img>.
function Thumb({ src, name }: { src?: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className="mp-thumb mp-thumb-empty">{name.charAt(0).toUpperCase()}</div>;
  return <img className="mp-thumb" src={src} alt="" onError={() => setBad(true)} />;
}

export function Merchant() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim().toLowerCase(); // top-bar search
  const [products, setProducts] = useState<Product[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [wiki, setWiki] = useState<WikiEntry[]>([]);
  const [msg, setMsg] = useState('');

  const [editor, setEditor] = useState<Editor>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState<null | WikiEntry>(null);
  // Empty list = a simple single-price product. Adding a row switches this
  // product to real variants, and price/stock then live on the rows.
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [payouts, setPayouts] = useState<Payouts | null>(null);
  // The shopfront: the name a customer sees under every product this store sells.
  const [store, setStore] = useState<StoreForm>(EMPTY_STORE);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeMsg, setStoreMsg] = useState('');
  const [linking, setLinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Top-bar search filters the list client-side — the merchant's own catalogue
  // is already loaded, so there's no reason to round-trip.
  const shown = useMemo(
    () => (q ? products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q)) : products),
    [products, q],
  );

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2400); };

  async function load() {
    const { products } = await api.get<{ products: Product[] }>('/merchant/products');
    setProducts(products);
    try {
      setRefunds((await api.get<{ requests: Refund[] }>('/merchant/refunds')).requests);
      setCost(await api.get<Cost>('/merchant/model-cost'));
      setWiki((await api.get<{ wiki: WikiEntry[] }>('/wiki')).wiki);
      setPayouts(await api.get<Payouts>('/merchant/payouts'));
      const st = await api.get<{ store: StoreForm | null }>('/merchant/store');
      if (st.store) setStore({ ...EMPTY_STORE, ...st.store });
    } catch { /* secondary panels are non-fatal */ }
  }
  useEffect(() => { load(); }, []);

  // --- product editor -------------------------------------------------------
  function openCreate() { setForm(EMPTY); setVariants([]); setUploadErr(''); setEditor({ mode: 'create' }); }

  async function saveStore() {
    setStoreSaving(true); setStoreMsg('');
    try {
      const r = await api.put<{ store: StoreForm }>('/merchant/store', store);
      setStore({ ...EMPTY_STORE, ...r.store });
      setStoreMsg('Saved — customers see this name on every product you sell.');
      setTimeout(() => setStoreMsg(''), 2600);
    } catch (e: any) { setStoreMsg(e.message); } finally { setStoreSaving(false); }
  }

  async function linkPayouts() {
    setLinking(true);
    try {
      await api.post('/merchant/payouts/link', { businessName: 'My Store' });
      say('Payout account checked'); await load();
    } catch (e: any) { say(e.message); } finally { setLinking(false); }
  }
  function openEdit(p: Product) {
    setForm({
      name: p.name, description: p.description ?? '', priceRupees: String(p.pricePaise / 100),
      stock: String(p.stock), category: p.category, image: p.image ?? '',
    });
    setUploadErr(''); setEditor({ mode: 'edit', id: p.id });
    // Load real variant rows so editing preserves them. A lone 'Default'
    // variant is the simple case, so it stays hidden behind price + stock.
    api.get<any>('/catalog/' + p.id).then(({ product }) => {
      const vs = product.variants ?? [];
      const real = vs.length > 1 || (vs[0] && vs[0].title !== 'Default');
      setVariants(real ? vs.map((v: any) => ({
        id: v.id, title: v.title, priceRupees: String(v.pricePaise / 100),
        stock: String(v.stock), sku: v.sku,
      })) : []);
    }).catch(() => setVariants([]));
  }
  function closeEditor() { setEditor(null); setForm(EMPTY); setUploadErr(''); }

  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadErr('');
    // Check before the network round-trip, so obvious mistakes fail instantly.
    if (!OK_TYPES.includes(file.type)) { setUploadErr('PNG, JPEG, WebP or GIF only.'); return; }
    if (file.size > MAX_BYTES) { setUploadErr('Image must be under 2 MB.'); return; }
    setUploading(true);
    try {
      const { url } = await apiUpload<{ url: string }>('/merchant/uploads', file);
      setForm((f) => ({ ...f, image: url }));
    } catch (e: any) {
      setUploadErr(e.message === 'missing bearer token' ? 'Your session expired — sign in again.' : e.message);
    } finally { setUploading(false); }
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      const body: any = {
        name: form.name,
        description: form.description,
        category: form.category,
        image: form.image,
      };
      // Variants own price and stock when present; otherwise send the simple shape.
      if (variants.length) {
        body.variants = variants.map((v) => ({
          id: v.id,
          title: v.title || 'Default',
          optionValues: v.title ? { Option: v.title } : {},
          priceRupees: Number(v.priceRupees || 0),
          stock: Number(v.stock || 0),
          sku: v.sku,
        }));
      } else {
        body.priceRupees = Number(form.priceRupees || 0);
        body.stock = Number(form.stock || 0);
      }
      if (editor.mode === 'edit') await api.put(`/merchant/products/${editor.id}`, body);
      else await api.post('/merchant/products', body);
      closeEditor(); say('Product saved'); await load();
    } catch (e: any) {
      say(e.message); // keep the panel open so nothing typed is lost
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    try { await api.del(`/merchant/products/${id}`); setConfirmDel(null); say('Product deleted'); await load(); }
    catch (e: any) { say(e.message); }
  }

  // --- other sections -------------------------------------------------------
  async function decideRefund(id: string, action: 'approve' | 'reject') {
    try { await api.post(`/merchant/refunds/${id}/${action}`); say(`Refund ${action}d`); await load(); }
    catch (e: any) { say(e.message); }
  }
  async function rebuildKG() {
    try { const r = await api.post<{ edges: number }>('/admin/materialize-kg'); say(`Knowledge graph rebuilt — ${r.edges} edges`); }
    catch (e: any) { say(e.message); }
  }
  async function saveWiki(w: WikiEntry) {
    try { await api.put(`/merchant/wiki/${w.key}`, { title: w.title, content: w.content }); say(`Saved “${w.title}”`); }
    catch (e: any) { say(e.message); }
  }
  async function deleteWikiEntry(key: string) {
    try { await api.del(`/merchant/wiki/${key}`); say('Entry deleted'); await load(); }
    catch (e: any) { say(e.message); }
  }
  async function addWikiEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!newEntry) return;
    if (!SLUG.test(newEntry.key)) { say('Key must be lowercase letters, digits or hyphens'); return; }
    if (wiki.some((w) => w.key === newEntry.key)) { say(`“${newEntry.key}” already exists — it would be overwritten`); return; }
    try { await api.put(`/merchant/wiki/${newEntry.key}`, { title: newEntry.title, content: newEntry.content }); setNewEntry(null); say('Entry added'); await load(); }
    catch (e: any) { say(e.message); }
  }

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Products</h1>
          <span className="muted">
            {q
              ? `${shown.length} of ${products.length} matching “${q}”`
              : `${products.length} product${products.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="row">
          <button className="ghost" onClick={rebuildKG}>Rebuild graph</button>
          <button className="btn-brand" onClick={openCreate}>+ Add product</button>
        </div>
      </div>

      {!shown.length ? (
        <div className="list-row glass mp-empty">
          <strong>{q ? `No products match “${q}”` : 'Add your first product'}</strong>
          <p className="muted">
            {q
              ? 'Try a different search term.'
              : 'Products you create appear in the storefront and become buyable by the assistant.'}
          </p>
          {!q && <button className="btn-brand" onClick={openCreate}>+ Add product</button>}
        </div>
      ) : (
        <div className="glass mp-tablewrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th colSpan={2}>Product</th><th>Status</th>
                <th className="num">Inventory</th><th className="num">Price</th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} onClick={() => openEdit(p)}>
                  <td className="mp-thumb-cell"><Thumb src={p.image} name={p.name} /></td>
                  <td>
                    <div className="mp-name" title={p.name}>{p.name}</div>
                    <div className="muted mp-cat">{p.category}</div>
                  </td>
                  <td>
                    <span className={`pill ${p.stock > 0 ? 'badge-ok' : 'badge-bad'}`}>
                      {p.stock > 0 ? 'In stock' : 'Out of stock'}
                    </span>
                  </td>
                  <td className="num">{p.stock}</td>
                  <td className="num price">{rupees(p.pricePaise)}</td>
                  <td className="mp-actions" onClick={(e) => e.stopPropagation()}>
                    {confirmDel === p.id ? (
                      <span className="row">
                        <span className="muted">Delete?</span>
                        <button className="danger" onClick={() => del(p.id)}>Yes</button>
                        <button className="ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="row">
                        <button className="ghost" onClick={() => nav(`/product/${p.id}`)}>View</button>
                        <button className="ghost" onClick={() => openEdit(p)}>Edit</button>
                        <button className="danger" onClick={() => setConfirmDel(p.id)}>Delete</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Refunds ---------- */}
      <div className="title" style={{ fontSize: 16 }}>
        Refund requests <span className="muted" style={{ fontWeight: 400 }}>· gated, approval required</span>
        {refunds.length > 0 && <span className="pill" style={{ marginLeft: 8 }}>{refunds.length} pending</span>}
      </div>
      {!refunds.length && <p className="muted">No pending refund requests.</p>}
      {refunds.map((r) => (
        <div key={r.id} className="list-row glass row between">
          <div>
            <strong>{rupees(Number(r.amount_paise))}</strong>{' '}
            <span className="muted">order {r.order_id.slice(0, 8)} · {r.requester_email}</span>
            <div className="muted" style={{ fontSize: 12 }}>{r.reason}</div>
          </div>
          <div className="row">
            <button onClick={() => decideRefund(r.id, 'approve')}>Approve</button>
            <button className="danger" onClick={() => decideRefund(r.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}

      {/* ---------- Shopfront ----------
          Several merchants share this catalogue, so a product with no store
          behind it is an anonymous listing. This is where that name is set. */}
      <div className="title" style={{ fontSize: 16 }}>Your shopfront</div>
      <div className="list-row glass">
        <div className="mp-store-grid">
          <div>
            <label>Store name</label>
            <input value={store.storeName} placeholder="Nova Tech"
              onChange={(e) => setStore({ ...store, storeName: e.target.value })} />
          </div>
          <div>
            <label>Icon</label>
            <input value={store.logo} placeholder="Emoji, e.g. ⚡" maxLength={4}
              onChange={(e) => setStore({ ...store, logo: e.target.value })} />
          </div>
          <div>
            <label>Location</label>
            <input value={store.location} placeholder="Bengaluru"
              onChange={(e) => setStore({ ...store, location: e.target.value })} />
          </div>
        </div>
        <label>Tagline</label>
        <input value={store.tagline} placeholder="What you sell, in one line"
          onChange={(e) => setStore({ ...store, tagline: e.target.value })} />
        <label>About</label>
        <textarea rows={2} value={store.about} placeholder="A short paragraph shown on your store page."
          onChange={(e) => setStore({ ...store, about: e.target.value })} />
        <div className="row between">
          <span className="muted" style={{ fontSize: 12 }}>
            {store.slug ? <>Your page: <code>/stores/{store.slug}</code></> : 'Save to publish your store page.'}
          </span>
          <div className="row">
            {storeMsg && <span className="muted" style={{ fontSize: 12 }}>{storeMsg}</span>}
            <button className="btn-brand" disabled={storeSaving || !store.storeName.trim()} onClick={saveStore}>
              {storeSaving ? 'Saving…' : 'Save shopfront'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Payouts ---------- */}
      <div className="title" style={{ fontSize: 16 }}>Payouts</div>
      <div className="list-row glass pay-card">
        <div className="pay-figs">
          <div className="pay-fig"><span>Earned</span><strong>{rupees(payouts?.balance.totalPaise ?? 0)}</strong></div>
          <div className="pay-fig"><span>Settled via Route</span><strong>{rupees(payouts?.balance.settledPaise ?? 0)}</strong></div>
          <div className="pay-fig"><span>Held in ledger</span><strong>{rupees(payouts?.balance.pendingPaise ?? 0)}</strong></div>
        </div>
        <div className="row">
          <span className={`pill ${payouts?.account?.status === 'active' ? 'badge-ok' : ''}`}>
            {payouts?.account ? payouts.account.status : 'not linked'}
          </span>
          <button className="ghost" disabled={linking} onClick={linkPayouts}>
            {linking ? 'Checking…' : payouts?.account ? 'Re-check Route' : 'Link payout account'}
          </button>
        </div>
      </div>
      {payouts?.account?.detail && <p className="muted" style={{ fontSize: 12 }}>{payouts.account.detail}</p>}

      {/* ---------- LLM cost ---------- */}
      <div className="title" style={{ fontSize: 16 }}>LLM cost tracker</div>
      <div className="list-row glass">
        {cost ? (
          <div className="row between">
            <span>{cost.totalCalls} model call{cost.totalCalls === 1 ? '' : 's'}</span>
            <span className="price">₹{cost.totalCost.toFixed(4)}</span>
          </div>
        ) : <span className="muted">No model usage yet.</span>}
        {cost?.byModel?.map((m: any) => (
          <div key={m.model} className="row between muted" style={{ fontSize: 12 }}>
            <span>{m.model}</span>
            <span>{m.calls} calls · {m.tokens_in}/{m.tokens_out} tok · ₹{Number(m.cost).toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* ---------- Documentation wiki ---------- */}
      <div className="title" style={{ fontSize: 16 }}>Documentation wiki</div>
      <p className="muted" style={{ marginTop: -6 }}>
        These facts are what the assistant quotes to customers. If the wiki disagrees with the
        database, the database wins.
      </p>
      {wiki.map((w, idx) => (
        <div key={w.key} className="list-row glass mp-wiki">
          <div className="row between mp-wiki-head">
            <input
              value={w.title}
              onChange={(e) => setWiki((ws) => ws.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
              aria-label={`Title for ${w.key}`}
            />
            <code>{w.key}</code>
          </div>
          <textarea
            rows={3}
            value={w.content}
            onChange={(e) => setWiki((ws) => ws.map((x, i) => (i === idx ? { ...x, content: e.target.value } : x)))}
            aria-label={`Content for ${w.key}`}
          />
          <div className="row">
            <button className="ghost" onClick={() => saveWiki(w)}>Save</button>
            <button className="danger" onClick={() => deleteWikiEntry(w.key)}>Delete</button>
          </div>
        </div>
      ))}

      {newEntry ? (
        <form className="list-row glass mp-wiki" onSubmit={addWikiEntry}>
          <div className="row between mp-wiki-head">
            <input
              placeholder="Title, e.g. Sizing guide" required
              value={newEntry.title}
              onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
            />
            <input
              className="mp-key" placeholder="key" required
              value={newEntry.key}
              onChange={(e) => setNewEntry({ ...newEntry, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            />
          </div>
          <textarea
            rows={3} required placeholder="What should the assistant tell customers?"
            value={newEntry.content}
            onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
          />
          <div className="row">
            <button type="submit">Add entry</button>
            <button type="button" className="ghost" onClick={() => setNewEntry(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="ghost" onClick={() => setNewEntry({ key: '', title: '', content: '' })}>+ Add entry</button>
      )}

      {/* ---------- Product editor slide-over ---------- */}
      {editor && (
        <>
          <div className="mp-scrim" onClick={closeEditor} />
          <aside className="mp-drawer">
            <div className="mp-drawer-head">
              <strong>{editor.mode === 'edit' ? 'Edit product' : 'Add product'}</strong>
              <button className="sp-rail-btn" onClick={closeEditor} aria-label="Close">{I.close()}</button>
            </div>

            <form className="mp-drawer-body" onSubmit={saveProduct}>
              <label>Media</label>
              {form.image ? (
                <div className="mp-preview">
                  <img src={form.image} alt="" />
                  <div className="row">
                    <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>Replace</button>
                    <button type="button" className="danger" onClick={() => setForm({ ...form, image: '' })}>Remove</button>
                  </div>
                </div>
              ) : (
                <div
                  className={`mp-drop ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                >
                  {uploading ? <span className="muted">Uploading…</span> : (
                    <>
                      <strong>Drop an image, or click to browse</strong>
                      <span className="muted">PNG, JPEG, WebP or GIF · up to 2 MB</span>
                    </>
                  )}
                </div>
              )}
              {uploadErr && <p className="badge-bad" style={{ fontSize: 13 }}>{uploadErr}</p>}
              <input
                ref={fileRef} type="file" accept={OK_TYPES.join(',')} hidden
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />

              <label>Title</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

              <label>Description</label>
              <textarea
                rows={4} value={form.description}
                placeholder="Shown to customers, and to the assistant when it recommends this product."
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />

              {!variants.length && (
                <div className="mp-row2">
                  <div>
                    <label>Price (₹)</label>
                    <input type="number" min="0" step="0.01" required
                      value={form.priceRupees} onChange={(e) => setForm({ ...form, priceRupees: e.target.value })} />
                  </div>
                  <div>
                    <label>Stock</label>
                    <input type="number" min="0" step="1" required
                      value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                  </div>
                </div>
              )}

              <label>Variants</label>
              {!variants.length && (
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                  One price for this product. Add a variant to sell sizes or colours separately.
                </p>
              )}
              {variants.map((v, i) => (
                <div key={i} className="mp-variant">
                  <input placeholder="Size / colour" value={v.title}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <input type="number" min="0" step="0.01" placeholder="₹" required value={v.priceRupees}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, priceRupees: e.target.value } : x)))} />
                  <input type="number" min="0" placeholder="Qty" required value={v.stock}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} />
                  <input placeholder="SKU" value={v.sku}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
                  <button type="button" className="danger" aria-label="Remove variant"
                    onClick={() => setVariants(variants.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => setVariants([...variants, NEW_VARIANT()])}>
                + Add variant
              </button>

              <label>Category</label>
              <input value={form.category} placeholder="e.g. mens-shirts"
                onChange={(e) => setForm({ ...form, category: e.target.value })} />

              <div className="mp-drawer-foot">
                <button type="button" className="ghost" onClick={closeEditor}>Cancel</button>
                <button type="submit" disabled={saving || uploading}>
                  {saving ? 'Saving…' : editor.mode === 'edit' ? 'Save changes' : 'Add product'}
                </button>
              </div>
            </form>
          </aside>
        </>
      )}

      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
