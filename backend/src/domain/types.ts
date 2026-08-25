// Core domain entities (shared shapes). Adapters map DB rows <-> these.
import type { Paise } from './money.js';

export type Role = 'customer' | 'merchant' | 'admin';

export interface User {
  id: string;
  email: string;
  roles: Role[];
  attributes: Record<string, unknown>; // ABAC: spend-limit tier, prefs, etc.
  createdAt: string;
}

export interface Product {
  id: string;
  sourceId: string | null;   // Door 1: id from the fetched source; null for merchant-created
  merchantId: string | null; // Door 2: owning merchant; null for seeded
  name: string;
  description: string;
  pricePaise: Paise;
  stock: number;
  category: string;
  rating: number;
  image: string;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  qty: number;
  pricePaise: Paise;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  totalPaise: Paise;
}

export type OrderStatus = 'created' | 'paid' | 'failed' | 'refunded';

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  totalPaise: Paise;
  status: OrderStatus;
  razorpayOrderId: string | null;
  createdAt: string;
}

export interface AuditEntry {
  actor: string;      // 'user' | 'system' | agent name
  action: string;
  target: string;
  amountPaise?: Paise;
  reason: string;
  verified?: boolean;
  runId?: string;
}
