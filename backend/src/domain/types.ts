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

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  position: number;
}

// The sellable unit. Price and stock live HERE — the product row only carries a
// display rollup (lowest price, total stock) maintained by a DB trigger.
export interface Variant {
  id: string;
  productId: string;
  title: string;
  optionValues: Record<string, string>; // { Size: 'M', Color: 'Blue' }
  pricePaise: Paise;
  compareAtPaise: Paise | null;
  sku: string;
  barcode: string;
  stock: number;
  weightGrams: number;
  imageUrl: string;
  position: number;
}

export interface ProductOption {
  name: string;     // 'Size'
  values: string[]; // ['S','M','L']
}

export interface Product {
  id: string;
  merchantId: string | null; // owning merchant
  name: string;
  description: string;
  pricePaise: Paise;   // display rollup: lowest variant price
  stock: number;       // display rollup: total variant stock
  category: string;
  rating: number;
  image: string;       // first image, kept for existing callers
  createdAt: string;

  status: 'active' | 'draft';
  productType: string;
  vendor: string;
  tags: string[];
  compareAtPaise: Paise | null;
  costPaise: Paise | null;
  trackInventory: boolean;
  sellWhenOutOfStock: boolean;
  physical: boolean;
  weightGrams: number;
  countryOfOrigin: string;
  hsCode: string;
  seoTitle: string;
  seoDescription: string;
  options: ProductOption[];

  images?: ProductImage[];
  variants?: Variant[];
}

export interface Collection {
  id: string;
  merchantId: string;
  title: string;
  handle: string;
  description: string;
  image: string;
  productCount?: number;
}

export interface CartItem {
  productId: string;
  variantId: string;
  variantTitle: string;
  name: string;
  image: string;
  qty: number;
  pricePaise: Paise;
}

export interface Cart {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
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
