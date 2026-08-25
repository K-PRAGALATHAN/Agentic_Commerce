// Thin fetch wrapper. All backend calls go through here; token is attached automatically.
const BASE = '/api';

let accessToken: string | null = localStorage.getItem('access') ?? null;

export function setToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('access', token);
  else localStorage.removeItem('access');
}

export function getToken() {
  return accessToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

// Agent service (separate origin, proxied at /agent). Token attached, never shown to the model.
export async function agentChat(message: string): Promise<{ reply: string; kind: string; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch('/agent/chat', { method: 'POST', headers, body: JSON.stringify({ message }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).detail ?? (data as any).error ?? `HTTP ${res.status}`);
  return data;
}

export const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
