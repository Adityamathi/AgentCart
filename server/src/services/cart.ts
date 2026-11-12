import { db } from '../db/index.js';
import { env } from '../env.js';
import { newId, nowIso, asInt } from '../lib/util.js';
import { HttpError } from '../lib/http.js';
import { getPolicy, evaluatePolicy, type Policy, type PolicyViolation } from './policies.js';
import type { Category } from '../types.js';

export interface CartItemView {
  id: string;
  productId: string;
  name: string;
  brand: string;
  category: Category;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
  available: boolean;
}

export interface CartTotals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

export interface CartView {
  id: string;
  items: CartItemView[];
  totals: CartTotals;
  policy: Policy;
  violations: PolicyViolation[];
  canCheckout: boolean;
  budgetRemainingCents: number;
  updatedAt: string;
}

interface CartRow {
  id: string;
  user_id: string;
  status: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  name: string;
  brand: string;
  category: string;
  stock: number;
}

export function computeTotals(subtotalCents: number, currency = env.paypalCurrency): CartTotals {
  const shippingCents = subtotalCents > 0 ? env.shippingFlatCents : 0;
  const taxCents = Math.round((subtotalCents * env.taxRateBps) / 10000);
  return {
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    currency,
  };
}

export async function getOrCreateCart(userId: string): Promise<CartRow> {
  const existing = await db.one<CartRow>(
    `SELECT * FROM carts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (existing) return existing;
  const timestamp = nowIso();
  const cart: CartRow = { id: newId(), user_id: userId, status: 'active', updated_at: timestamp };
  await db.query(`INSERT INTO carts (id, user_id, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`, [
    cart.id,
    userId,
    timestamp,
    timestamp,
  ]);
  return cart;
}

export async function readCart(userId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  const rows = await db.query<ItemRow>(
    `SELECT ci.id, ci.product_id, ci.quantity, ci.unit_price_cents, p.name, p.brand, p.category, p.stock
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ? ORDER BY ci.created_at`,
    [cart.id],
  );

  const items: CartItemView[] = rows.map((row) => {
    const quantity = asInt(row.quantity);
    const unitPriceCents = asInt(row.unit_price_cents);
    return {
      id: row.id,
      productId: row.product_id,
      name: row.name,
      brand: row.brand,
      category: row.category as Category,
      unitPriceCents,
      quantity,
      stock: asInt(row.stock),
      lineTotalCents: unitPriceCents * quantity,
      available: asInt(row.stock) >= quantity,
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totals = computeTotals(subtotalCents);
  const policy = await getPolicy(userId);
  const violations = evaluatePolicy(
    policy,
    items.map((item) => ({
      productId: item.productId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      stock: item.stock,
    })),
    totals,
  );

  return {
    id: cart.id,
    items,
    totals,
    policy,
    violations,
    canCheckout: items.length > 0 && violations.length === 0,
    budgetRemainingCents: policy.maxBudgetCents - totals.totalCents,
    updatedAt: cart.updated_at,
  };
}

export async function addItem(userId: string, productId: string, quantity = 1): Promise<CartView> {
  const amount = Math.max(1, Math.min(asInt(quantity, 1), 20));
  const product = await db.one<{ id: string; stock: number; price_cents: number; name: string }>(
    `SELECT id, stock, price_cents, name FROM products WHERE id = ?`,
    [productId],
  );
  if (!product) throw new HttpError(404, 'Product not found in the catalogue', 'product_not_found');
  if (asInt(product.stock) <= 0) throw new HttpError(409, `${product.name} is out of stock`, 'out_of_stock');

  const cart = await getOrCreateCart(userId);
  const existing = await db.one<{ id: string; quantity: number }>(
    `SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?`,
    [cart.id, productId],
  );
  const nextQuantity = (existing ? asInt(existing.quantity) : 0) + amount;
  if (nextQuantity > asInt(product.stock)) {
    throw new HttpError(409, `Only ${product.stock} units of ${product.name} are in stock`, 'insufficient_stock');
  }

  const timestamp = nowIso();
  if (existing) {
    await db.query(`UPDATE cart_items SET quantity = ?, unit_price_cents = ?, updated_at = ? WHERE id = ?`, [
      nextQuantity,
      asInt(product.price_cents),
      timestamp,
      existing.id,
    ]);
  } else {
    await db.query(
      `INSERT INTO cart_items (id, cart_id, product_id, quantity, unit_price_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), cart.id, productId, amount, asInt(product.price_cents), timestamp, timestamp],
    );
  }
  await db.query(`UPDATE carts SET updated_at = ? WHERE id = ?`, [timestamp, cart.id]);
  return readCart(userId);
}

export async function setQuantity(userId: string, itemId: string, quantity: number): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  const row = await db.one<{ id: string; product_id: string; stock: number }>(
    `SELECT ci.id, ci.product_id, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.id = ? AND ci.cart_id = ?`,
    [itemId, cart.id],
  );
  if (!row) throw new HttpError(404, 'Cart item not found', 'cart_item_not_found');
  const next = asInt(quantity);
  if (next <= 0) return removeItem(userId, itemId);
  if (next > asInt(row.stock)) {
    throw new HttpError(409, `Only ${row.stock} units are in stock`, 'insufficient_stock');
  }
  await db.query(`UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?`, [next, nowIso(), itemId]);
  return readCart(userId);
}

export async function removeItem(userId: string, itemId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  await db.query(`DELETE FROM cart_items WHERE id = ? AND cart_id = ?`, [itemId, cart.id]);
  return readCart(userId);
}

export async function removeByProduct(userId: string, productId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  await db.query(`DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`, [cart.id, productId]);
  return readCart(userId);
}

export async function clearCart(userId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  await db.query(`DELETE FROM cart_items WHERE cart_id = ?`, [cart.id]);
  return readCart(userId);
}
