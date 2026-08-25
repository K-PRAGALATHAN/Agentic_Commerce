import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, getToken } from './api.js';

export interface User {
  id: string;
  email: string;
  roles: string[];
  attributes: Record<string, unknown>;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, role: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const { user } = await api.get<{ user: User }>('/me');
          setUser(user);
        } catch {
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const { user, tokens } = await api.post<{ user: User; tokens: { access: string } }>('/auth/login', { email, password });
    setToken(tokens.access);
    setUser(user);
  }

  async function signup(email: string, password: string, role: string) {
    await api.post('/auth/signup', { email, password, role });
    await login(email, password);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, signup, logout }}>{children}</Ctx.Provider>;
}
