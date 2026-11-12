import { beforeAll, describe, expect, it } from 'vitest';
import { db, migrate } from '../src/db/index.js';
import { seedProducts } from '../src/db/seed.js';
import { createUser } from '../src/services/users.js';
import { addItem, readCart, removeByProduct, setQuantity } from '../src/services/cart.js';
import { savePolicy } from '../src/services/policies.js';
import { createOrderFromCart, settleOrder, getOrder, getOrderRow } from '../src/services/orders.js';

let userId = '';

beforeAll(async () => {
  await migrate();
  await seedProducts();
  const user = await createUser({ email: 'cart@test.dev', name: 'Cart buyer', password: 'test-password' });
  userId = user.id;
});

describe('cart', () => {
  it('calculates totals from catalogue prices', async () => {
    const cart = await addItem(userId, 'lenovo-loq-15', 1);
    expect(cart.items).toHaveLength(1);
    expect(cart.totals.subtotalCents).toBe(89900);
    expect(cart.totals.totalCents).toBe(89900);
    expect(cart.canCheckout).toBe(true);
  });

  it('rejects quantities beyond stock', async () => {
    await expect(addItem(userId, 'asus-rog-zephyrus-g14', 1)).rejects.toThrow(/out of stock/i);
  });

  it('changes quantity and recalculates', async () => {
    const cart = await readCart(userId);
    const item = cart.items[0];
    const updated = await setQuantity(userId, item.id, 2);
    expect(updated.items[0].quantity).toBe(2);
    expect(updated.totals.totalCents).toBe(179800);
    await setQuantity(userId, item.id, 1);
  });

  it('enforces the budget policy on the server', async () => {
    await savePolicy(userId, {
      maxBudgetCents: 50000,
      maxQuantity: 3,
      allowedCategories: [],
      blockedCategories: [],
      requireApproval: true,
    });
    const cart = await readCart(userId);
    expect(cart.canCheckout).toBe(false);
    expect(cart.violations.map((violation) => violation.code)).toContain('budget_exceeded');
    await expect(createOrderFromCart(userId)).rejects.toThrow(/policy/i);
    await savePolicy(userId, {
      maxBudgetCents: 200000,
      maxQuantity: 3,
      allowedCategories: [],
      blockedCategories: [],
      requireApproval: true,
    });
  });

  it('enforces blocked categories', async () => {
    await savePolicy(userId, {
      maxBudgetCents: 200000,
      maxQuantity: 3,
      allowedCategories: [],
      blockedCategories: ['laptops'],
      requireApproval: true,
    });
    const cart = await readCart(userId);
    expect(cart.violations.some((violation) => violation.code === 'category_blocked')).toBe(true);
    await savePolicy(userId, {
      maxBudgetCents: 200000,
      maxQuantity: 3,
      allowedCategories: [],
      blockedCategories: [],
      requireApproval: true,
    });
  });

  it('removes a product', async () => {
    const cart = await removeByProduct(userId, 'lenovo-loq-15');
    expect(cart.items).toHaveLength(0);
  });
});

describe('orders', () => {
  it('creates an approval order and settles it exactly once', async () => {
    await addItem(userId, 'hp-victus-15', 1);
    const order = await createOrderFromCart(userId);
    expect(order.status).toBe('awaiting_approval');
    expect(order.totalCents).toBe(74900);

    const row = (await getOrderRow(order.id))!;
    const capture = {
      id: 'CAPTURE-TEST-1',
      status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '749.00' },
      payer: { email_address: 'buyer@test.dev' },
    } as any;

    const first = await settleOrder({ order: row, capture, paypalOrder: { id: 'PAYPAL-1', status: 'COMPLETED' }, source: 'capture' });
    expect(first.alreadyPaid).toBe(false);

    const view = await getOrder(userId, order.id);
    expect(view?.status).toBe('paid');
    expect(view?.paypalCaptureId).toBe('CAPTURE-TEST-1');
    expect(view?.payment?.status).toBe('COMPLETED');

    const stock = await db.one<{ stock: number }>(`SELECT stock FROM products WHERE id = 'hp-victus-15'`);
    expect(Number(stock?.stock)).toBe(15);

    const second = await settleOrder({
      order: (await getOrderRow(order.id))!,
      capture,
      paypalOrder: { id: 'PAYPAL-1', status: 'COMPLETED' },
      source: 'webhook',
    });
    expect(second.alreadyPaid).toBe(true);
  });

  it('rejects a capture whose amount does not match the order', async () => {
    await addItem(userId, 'logitech-m720', 1);
    const order = await createOrderFromCart(userId);
    const row = (await getOrderRow(order.id))!;
    await expect(
      settleOrder({
        order: row,
        capture: { id: 'CAPTURE-TEST-2', status: 'COMPLETED', amount: { currency_code: 'USD', value: '1.00' } } as any,
        paypalOrder: { id: 'PAYPAL-2', status: 'COMPLETED' },
        source: 'capture',
      }),
    ).rejects.toThrow(/does not match/i);
  });
});
