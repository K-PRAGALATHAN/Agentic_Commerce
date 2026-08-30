// Thin fetch wrapper. All backend calls go through here; token is attached automatically.
const BASE = '/api';

let accessToken: string | null = localStorage.getItem('access') ?? null;
let refreshToken: string | null = localStorage.getItem('refresh') ?? null;

export function setToken(token: string | null, refresh?: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('access', token);
  else localStorage.removeItem('access');
  if (refresh !== undefined) {
    refreshToken = refresh;
    if (refresh) localStorage.setItem('refresh', refresh);
    else localStorage.removeItem('refresh');
  }
}

// One renewal in flight at a time. Without this, a page that fires six requests
// on mount would attempt six refreshes, and rotation means five of them lose.
let renewing: Promise<boolean> | null = null;

async function renew(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!renewing) {
    renewing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        });
        if (!res.ok) { setToken(null, null); return false; }
        const data = await res.json();
        setToken(data.tokens.access, data.tokens.refresh);
        return true;
      } catch {
        return false;
      } finally {
        renewing = null;
      }
    })();
  }
  return renewing;
}

export function getToken() {
  return accessToken;
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body);
  // An expired access token is renewed and the call replayed once, so the user
  // never sees a session end mid-task. A second 401 is a real one.
  if (res.status === 401 && (await renew())) res = await send(method, path, body);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

// File upload. Deliberately NOT api.post: multipart needs the browser to set
// Content-Type itself so it can add the boundary, and request() hard-codes JSON.
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const call = () => {
    const body = new FormData();
    body.append('file', file);
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`${BASE}${path}`, { method: 'POST', headers, body });
  };
  let res = await call();
  if (res.status === 401 && (await renew())) res = await call();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`);
  return data as T;
}

// Agent service (separate origin, proxied at /agent). Token attached, never shown to the model.
export async function agentChat(
  message: string,
  conversationId?: string,
): Promise<{ reply: string; kind: string; data: any }> {
  const call = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    // The chat id scopes the agent's working memory, so switching chats really
    // does start a new thread.
    return fetch('/agent/chat', { method: 'POST', headers, body: JSON.stringify({ message, conversationId }) });
  };
  let res = await call();
  // The agent validates the token via the backend, so an expired one 401s here too.
  if (res.status === 401 && (await renew())) res = await call();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).detail ?? (data as any).error ?? `HTTP ${res.status}`);
  return data;
}

export const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
