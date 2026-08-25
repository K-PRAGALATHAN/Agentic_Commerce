import { randomUUID } from 'node:crypto';
import { config } from '../../config/env.js';
import { Money } from '../../domain/money.js';

// Door 1: fetch products from an internet source and NORMALIZE to our shape.
// Normalization is the ONLY place a price becomes paise — nothing downstream
// ever sees a non-paise price, whichever door a product enters through.

export interface NormalizedProduct {
  sourceId: string;
  name: string;
  description: string;
  pricePaise: number;
  stock: number;
  category: string;
  rating: number;
  image: string;
}

export function normalize(raw: any): NormalizedProduct {
  // Shaped for DummyJSON; tolerant of missing fields so other sources work too.
  const priceRupees = Number(raw.price ?? raw.amount ?? 0);
  return {
    sourceId: String(raw.id ?? raw.sku ?? randomUUID()),
    name: String(raw.title ?? raw.name ?? 'Unnamed product'),
    description: String(raw.description ?? ''),
    pricePaise: Money.fromRupees(priceRupees),
    stock: Number(raw.stock ?? 0),
    category: String(raw.category ?? 'general'),
    rating: Number(raw.rating ?? 0),
    image: String(raw.thumbnail ?? raw.image ?? (raw.images?.[0] ?? '')),
  };
}

export async function fetchProducts(): Promise<NormalizedProduct[]> {
  const res = await fetch(config.catalog.sourceUrl);
  if (!res.ok) throw new Error(`catalog source ${res.status}`);
  const data: any = await res.json();
  const items: any[] = Array.isArray(data) ? data : (data.products ?? data.items ?? []);
  return items.map(normalize);
}
