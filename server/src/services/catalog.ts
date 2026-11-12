import { db, type Q } from '../db/index.js';
import type { Category, Product } from '../types.js';
import { parseJson } from '../lib/util.js';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price_cents: number;
  currency: string;
  stock: number;
  rating: number;
  specs: string;
  tags: string;
  pros: string;
  cons: string;
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category as Category,
    description: row.description,
    priceCents: Number(row.price_cents),
    currency: row.currency,
    stock: Number(row.stock),
    rating: Number(row.rating),
    specs: parseJson<Record<string, string>>(row.specs, {}),
    tags: parseJson<string[]>(row.tags, []),
    pros: parseJson<string[]>(row.pros, []),
    cons: parseJson<string[]>(row.cons, []),
  };
}

const SELECT = `SELECT * FROM products`;

export interface ProductQuery {
  q?: string;
  category?: string;
  brands?: string[];
  minPriceCents?: number;
  maxPriceCents?: number;
  inStockOnly?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'name';
  limit?: number;
}

export async function allProducts(): Promise<Product[]> {
  const rows = await db.query<ProductRow>(`${SELECT} ORDER BY name`);
  return rows.map(rowToProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  const row = await db.one<ProductRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? rowToProduct(row) : null;
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.query<ProductRow>(`${SELECT} WHERE id IN (${placeholders})`, ids);
  const byId = new Map(rows.map((row) => [row.id, rowToProduct(row)]));
  return ids.map((id) => byId.get(id)).filter((product): product is Product => Boolean(product));
}

export async function brands(): Promise<string[]> {
  const rows = await db.query<{ brand: string }>(`SELECT DISTINCT brand FROM products ORDER BY brand`);
  return rows.map((row) => row.brand);
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

const SYNONYMS: Record<string, string[]> = {
  notebook: ['laptop'],
  laptops: ['laptop'],
  computer: ['laptop'],
  workstation: ['laptop'],
  phone: ['smartphone'],
  phones: ['smartphone', 'smartphones'],
  mobile: ['smartphone'],
  earbuds: ['headphones', 'earbuds'],
  headset: ['headphones'],
  cans: ['headphones'],
  mouse: ['mouse', 'peripherals'],
  mice: ['mouse', 'peripherals'],
  keyboard: ['keyboard', 'peripherals'],
  monitor: ['monitor', 'peripherals'],
  display: ['monitor', 'display'],
  webcam: ['webcam', 'camera'],
  ssd: ['ssd', 'storage'],
  drive: ['ssd', 'storage'],
  charger: ['charger', 'usb-c'],
  hub: ['hub', 'usb-c'],
  'machine-learning': ['machine learning', 'cuda', 'gpu'],
  ml: ['machine learning', 'gpu'],
  ai: ['machine learning', 'gpu'],
  cv: ['computer vision', 'camera'],
  ros: ['ros', 'robotics'],
};

export function relevanceScore(product: Product, query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const haystack = [product.name, product.brand, product.category, product.description, ...product.tags]
    .join(' ')
    .toLowerCase();
  const specText = Object.values(product.specs).join(' ').toLowerCase();
  let score = 0;

  for (const token of tokens) {
    const variants = [token, ...(SYNONYMS[token] ?? [])];
    for (const variant of variants) {
      if (variant.includes(' ')) {
        if (haystack.includes(variant)) score += 4;
      } else if (product.tags.includes(variant)) {
        score += 5;
      } else if (product.name.toLowerCase().includes(variant) || product.brand.toLowerCase().includes(variant)) {
        score += 4;
      } else if (product.category === variant || product.category.replace(/s$/, '') === variant) {
        score += 3;
      } else if (haystack.includes(variant)) {
        score += 2;
      } else if (specText.includes(variant)) {
        score += 1;
      }
    }
  }
  return score;
}

export async function searchProducts(query: ProductQuery): Promise<Product[]> {
  const rows = await db.query<ProductRow>(`${SELECT} ORDER BY name`);
  let items = rows.map(rowToProduct);

  if (query.category) items = items.filter((p) => p.category === query.category);
  if (query.brands?.length) items = items.filter((p) => query.brands!.includes(p.brand));
  if (typeof query.minPriceCents === 'number') items = items.filter((p) => p.priceCents >= query.minPriceCents!);
  if (typeof query.maxPriceCents === 'number') items = items.filter((p) => p.priceCents <= query.maxPriceCents!);
  if (query.inStockOnly) items = items.filter((p) => p.stock > 0);

  if (query.q?.trim()) {
    const scored = items
      .map((product) => ({ product, score: relevanceScore(product, query.q!) }))
      .filter((entry) => entry.score >= 2);
    items = scored.sort((a, b) => b.score - a.score).map((entry) => entry.product);
  } else {
    switch (query.sort) {
      case 'price_asc':
        items.sort((a, b) => a.priceCents - b.priceCents);
        break;
      case 'price_desc':
        items.sort((a, b) => b.priceCents - a.priceCents);
        break;
      case 'rating':
        items.sort((a, b) => b.rating - a.rating);
        break;
      default:
        items.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    }
  }

  if (query.q?.trim() && query.sort && query.sort !== 'relevance') {
    switch (query.sort) {
      case 'price_asc':
        items.sort((a, b) => a.priceCents - b.priceCents);
        break;
      case 'price_desc':
        items.sort((a, b) => b.priceCents - a.priceCents);
        break;
      case 'rating':
        items.sort((a, b) => b.rating - a.rating);
        break;
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
  }

  const limit = Math.min(Math.max(query.limit ?? 60, 1), 100);
  return items.slice(0, limit);
}

export async function decrementStock(q: Q, productId: string, quantity: number): Promise<boolean> {
  const rows = await q<{ stock: number }>(`SELECT stock FROM products WHERE id = ?`, [productId]);
  const stock = Number(rows[0]?.stock ?? 0);
  if (stock < quantity) return false;
  await q(`UPDATE products SET stock = ?, updated_at = ? WHERE id = ?`, [stock - quantity, new Date().toISOString(), productId]);
  return true;
}

export async function restoreStock(q: Q, productId: string, quantity: number): Promise<void> {
  await q(`UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?`, [quantity, new Date().toISOString(), productId]);
}
