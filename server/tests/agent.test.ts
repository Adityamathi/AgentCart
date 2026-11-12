import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/index.js';
import { seedProducts } from '../src/db/seed.js';
import { createUser } from '../src/services/users.js';
import { savePolicy } from '../src/services/policies.js';
import { readCart } from '../src/services/cart.js';
import { runAgentTurn } from '../src/agent/engine.js';
import { searchProducts } from '../src/services/catalog.js';
import { executeTool } from '../src/agent/tools.js';
import { checkRequirements } from '../src/agent/requirements.js';

let userId = '';
let sessionId: string | null = null;

beforeAll(async () => {
  await migrate();
  await seedProducts();
  const user = await createUser({ email: 'agent@test.dev', name: 'Agent buyer', password: 'test-password' });
  userId = user.id;
  await savePolicy(userId, {
    maxBudgetCents: 100000,
    maxQuantity: 3,
    allowedCategories: [],
    blockedCategories: [],
    requireApproval: true,
  });
});

describe('catalogue search', () => {
  it('finds laptops by use case and budget', async () => {
    const results = await searchProducts({ q: 'laptop robotics python gpu', inStockOnly: true, limit: 6 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.category === 'laptops')).toBe(true);
  });

  it('filters by price ceiling', async () => {
    const results = await searchProducts({ q: 'laptop', maxPriceCents: 80000, inStockOnly: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.priceCents <= 80000)).toBe(true);
  });

  it('reads requirement evidence from the catalogue record', async () => {
    const product = (await searchProducts({ q: 'lenovo loq', limit: 1 }))[0];
    const result = checkRequirements(product, ['16 GB RAM', 'dedicated GPU', 'Linux support']);
    expect(result.checks).toHaveLength(3);
    expect(result.checks[0].evidence).toMatch(/16 GB/);
    expect(result.met).toBeGreaterThan(0);
  });
});

describe('agent turn (local planner)', () => {
  it('searches, compares and recommends within budget without a model key', async () => {
    const result = await runAgentTurn({
      userId,
      text: 'I need a laptop for robotics with 16 GB RAM and a dedicated GPU under $1,000',
    });
    expect(result.provider).toBe('heuristic');
    expect(result.executions.some((execution) => execution.tool === 'search_products')).toBe(true);
    expect(result.executions.some((execution) => execution.tool === 'compare_products')).toBe(true);
    expect(result.reply).toMatch(/LOQ|Nitro|Victus/);
    expect(result.sessionId).toBeTruthy();
    sessionId = result.sessionId;
  });

  it('adds the selected option to the cart', async () => {
    const result = await runAgentTurn({ userId, text: 'choose 1', sessionId });
    expect(result.executions.some((execution) => execution.tool === 'add_to_cart')).toBe(true);
    const cart = await readCart(userId);
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].quantity).toBe(1);
  });

  it('prepares an approval request but never pays', async () => {
    const result = await runAgentTurn({ userId, text: 'proceed to checkout', sessionId });
    const prepared = result.executions.find((execution) => execution.tool === 'prepare_checkout');
    expect(prepared?.status).toBe('ok');
    expect(result.approval?.orderId).toBeTruthy();
    expect(result.reply.toLowerCase()).toContain('nothing is charged');
  });

  it('keeps tool input validation strict', async () => {
    const result = await executeTool('add_to_cart', { productId: '', quantity: 99 }, { userId, sessionId: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid input|No catalogue product/);
  });
});
