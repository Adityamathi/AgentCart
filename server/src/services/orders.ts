import { db } from '../db/index.js';
import { newId, nowIso, asInt } from '../lib/util.js';
import { HttpError } from '../lib/http.js';
import { readCart, getOrCreateCart, type CartView } from './cart.js';
import { restoreStock, decrementStock } from './catalog.js';
import { extractCapture, type PayPalOrderResponse } from './paypal.js';

export type OrderStatus =
  | 'awaiting_approval'
  | 'paypal_created'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface OrderRow {
  id: string;
  user_id: string;
  cart_id: string | null;
  status: OrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  payer_email: string | null;
  approval_note: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  paid_at: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  brand: string;
  quantity: number;
  unit_price_cents: number;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  items: Array<{
    productId: string;
    name: string;
    brand: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  payerEmail: string | null;
  approvalNote: string | null;
  failureReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  payment: {
    status: string;
    providerCaptureId: string | null;
    amountCents: number;
    currency: string;
  } | null;
}

export function toOrderView(row: OrderRow, items: OrderItemRow[], payment?: OrderView['payment']): OrderView {
  return {
    id: row.id,
    status: row.status,
    items: items.map((item) => ({
      productId: item.product_id,
      name: item.name,
      brand: item.brand,
      quantity: asInt(item.quantity),
      unitPriceCents: asInt(item.unit_price_cents),
      lineTotalCents: asInt(item.quantity) * asInt(item.unit_price_cents),
    })),
    subtotalCents: asInt(row.subtotal_cents),
    shippingCents: asInt(row.shipping_cents),
    taxCents: asInt(row.tax_cents),
    totalCents: asInt(row.total_cents),
    currency: row.currency,
    paypalOrderId: row.paypal_order_id,
    paypalCaptureId: row.paypal_capture_id,
    payerEmail: row.payer_email,
    approvalNote: row.approval_note,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    payment: payment ?? null,
  };
}

export function orderViewFromCart(cart: CartView, policyOk: boolean): Partial<OrderView> {
  return {
    subtotalCents: cart.totals.subtotalCents,
    totalCents: cart.totals.totalCents,
    itemCount: cart.items.length,
    canCheckout: policyOk,
  } as Partial<OrderView>;
}

/**
 * Creates an order from the server-side cart. Every price, quantity and total
 * comes from the database, never from the request body.
 */
export async function createOrderFromCart(
  userId: string,
  note = 'Approved by the buyer in the AgentCart approval sheet',
): Promise<OrderView> {
  const cart = await readCart(userId);
  if (cart.items.length === 0) throw new HttpError(400, 'The cart is empty', 'empty_cart');
  if (cart.violations.length > 0) {
    throw new HttpError(409, 'The cart does not satisfy your purchasing policy', 'policy_violation', cart.violations);
  }

  const timestamp = nowIso();
  const orderId = newId();
  const cartRow = await getOrCreateCart(userId);

  await db.transaction(async (q) => {
    await q(
      `INSERT INTO orders (id, user_id, cart_id, status, subtotal_cents, shipping_cents, tax_cents, total_cents, currency, approval_note, created_at, updated_at)
       VALUES (?, ?, ?, 'awaiting_approval', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        userId,
        cartRow.id,
        cart.totals.subtotalCents,
        cart.totals.shippingCents,
        cart.totals.taxCents,
        cart.totals.totalCents,
        cart.totals.currency,
        note,
        timestamp,
        timestamp,
      ],
    );
    for (const item of cart.items) {
      await q(
        `INSERT INTO order_items (id, order_id, product_id, name, brand, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId(), orderId, item.productId, item.name, item.brand, item.quantity, item.unitPriceCents],
      );
    }
  });

  return (await getOrder(userId, orderId))!;
}

export async function getOrderRow(orderId: string): Promise<OrderRow | null> {
  return db.one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
}

export async function getOrder(userId: string, orderId: string): Promise<OrderView | null> {
  const row = await db.one<OrderRow>(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, userId]);
  if (!row) return null;
  const items = await db.query<OrderItemRow>(`SELECT * FROM order_items WHERE order_id = ? ORDER BY name`, [orderId]);
  const payment = await db.one<{ status: string; provider_capture_id: string | null; amount_cents: number; currency: string }>(
    `SELECT status, provider_capture_id, amount_cents, currency FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );
  return toOrderView(
    row,
    items,
    payment
      ? {
          status: payment.status,
          providerCaptureId: payment.provider_capture_id,
          amountCents: asInt(payment.amount_cents),
          currency: payment.currency,
        }
      : null,
  );
}

export async function listOrders(userId: string): Promise<OrderView[]> {
  const rows = await db.query<OrderRow>(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [
    userId,
  ]);
  const orders: OrderView[] = [];
  for (const row of rows) {
    const view = await getOrder(userId, row.id);
    if (view) orders.push(view);
  }
  return orders;
}

export async function attachPaypalOrder(orderId: string, paypalOrderId: string): Promise<void> {
  await db.query(
    `UPDATE orders SET paypal_order_id = ?, status = 'paypal_created', approved_at = COALESCE(approved_at, ?), updated_at = ? WHERE id = ?`,
    [paypalOrderId, nowIso(), nowIso(), orderId],
  );
}

export async function failOrder(orderId: string, reason: string): Promise<void> {
  await db.query(`UPDATE orders SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ? AND status != 'paid'`, [
    reason.slice(0, 300),
    nowIso(),
    orderId,
  ]);
}

export async function cancelOrder(userId: string, orderId: string): Promise<OrderView | null> {
  const row = await db.one<OrderRow>(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, userId]);
  if (!row) return null;
  if (row.status !== 'paid') {
    await db.query(`UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?`, [nowIso(), orderId]);
  }
  return getOrder(userId, orderId);
}

export async function findOrderByPaypalId(paypalOrderId: string): Promise<OrderRow | null> {
  return db.one<OrderRow>(`SELECT * FROM orders WHERE paypal_order_id = ?`, [paypalOrderId]);
}

/**
 * Marks an order paid from a verified PayPal capture. Idempotent: a second
 * capture for the same order returns the existing order without touching stock.
 */
export async function settleOrder(params: {
  order: OrderRow;
  capture: ReturnType<typeof extractCapture>;
  paypalOrder: PayPalOrderResponse;
  source: 'capture' | 'webhook';
}): Promise<{ order: OrderRow; alreadyPaid: boolean }> {
  const { order, paypalOrder, source } = params;
  const capture = params.capture;

  if (order.status === 'paid') return { order, alreadyPaid: true };
  if (!capture || capture.status !== 'COMPLETED') {
    await failOrder(order.id, `PayPal capture status was ${capture?.status ?? 'missing'}`);
    throw new HttpError(402, 'PayPal has not completed this payment', 'capture_incomplete', {
      status: capture?.status ?? null,
    });
  }

  const capturedCents = Math.round(Number(capture.amount?.value ?? '0') * 100);
  const currency = capture.amount?.currency_code ?? order.currency;
  if (capturedCents !== asInt(order.total_cents) || currency !== order.currency) {
    await failOrder(
      order.id,
      `Captured amount ${capture.amount?.value} ${currency} does not match the order total ${(asInt(order.total_cents) / 100).toFixed(2)} ${order.currency}`,
    );
    throw new HttpError(409, 'The captured amount does not match the order total', 'amount_mismatch');
  }

  const items = await db.query<OrderItemRow>(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
  const timestamp = nowIso();

  await db.transaction(async (q) => {
    for (const item of items) {
      const ok = await decrementStock(q, item.product_id, asInt(item.quantity));
      if (!ok) {
        throw new HttpError(409, `${item.name} sold out before the payment settled`, 'insufficient_stock');
      }
    }
    await q(
      `UPDATE orders SET status = 'paid', paypal_capture_id = ?, payer_email = ?, paid_at = ?, updated_at = ?, failure_reason = NULL
       WHERE id = ? AND status != 'paid'`,
      [capture.id, capture.payer?.email_address ?? null, timestamp, timestamp, order.id],
    );
    await q(
      `INSERT INTO payments (id, order_id, provider, provider_order_id, provider_capture_id, status, amount_cents, currency, payer_email, raw, created_at, updated_at)
       VALUES (?, ?, 'paypal', ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        order.id,
        paypalOrder.id,
        capture.id,
        capturedCents,
        currency,
        capture.payer?.email_address ?? null,
        JSON.stringify({ source, status: paypalOrder.status, capture }),
        timestamp,
        timestamp,
      ],
    );
    if (order.cart_id) {
      await q(`DELETE FROM cart_items WHERE cart_id = ?`, [order.cart_id]);
      await q(`UPDATE carts SET status = 'checked_out', updated_at = ? WHERE id = ?`, [timestamp, order.cart_id]);
    }
  });

  const updated = (await db.one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, [order.id]))!;
  return { order: updated, alreadyPaid: false };
}

export async function recordPaymentEvent(input: {
  eventId: string;
  eventType: string;
  orderId?: string | null;
  payload: unknown;
}): Promise<boolean> {
  const existing = await db.one<{ id: string }>(`SELECT id FROM payment_events WHERE event_id = ?`, [input.eventId]);
  if (existing) return false;
  await db.query(
    `INSERT INTO payment_events (id, provider, event_id, event_type, order_id, payload, created_at) VALUES (?, 'paypal', ?, ?, ?, ?, ?)`,
    [newId(), input.eventId, input.eventType, input.orderId ?? null, JSON.stringify(input.payload), nowIso()],
  );
  return true;
}

export async function releaseStockForFailedOrder(orderId: string): Promise<void> {
  const items = await db.query<OrderItemRow>(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]);
  await db.transaction(async (q) => {
    for (const item of items) await restoreStock(q, item.product_id, asInt(item.quantity));
  });
}
