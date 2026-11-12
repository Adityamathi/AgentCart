import { z } from 'zod';
import { db } from '../db/index.js';
import { asInt, newId, nowIso } from '../lib/util.js';
import { HttpError } from '../lib/http.js';
import { getProduct, searchProducts, getProductsByIds } from '../services/catalog.js';
import { addItem, readCart, removeByProduct } from '../services/cart.js';
import { getPolicy } from '../services/policies.js';
import { createOrderFromCart, toOrderView, type OrderItemRow, type OrderRow } from '../services/orders.js';
import { checkRequirements, describeProduct } from './requirements.js';
import { categories } from '../catalog/products.js';
import type { Category, Product } from '../types.js';

export interface ToolSpec {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  input: z.ZodTypeAny;
}

const categoryEnum = z.enum(categories as [Category, ...Category[]]);

function productSnapshot(product: Product) {
  return {
    ...describeProduct(product),
    inStock: product.stock > 0,
  };
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'search_products',
    label: 'Searching the catalogue',
    description:
      'Search the AgentCart catalogue by free text, category and price ceiling. Returns real catalogue records only. Use this before recommending anything.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the buyer is looking for, e.g. "laptop for robotics with GPU"' },
        category: { type: 'string', enum: categories, description: 'Optional category filter' },
        maxPriceCents: { type: 'number', description: 'Maximum unit price in cents, from the buyer budget' },
        minPriceCents: { type: 'number', description: 'Minimum unit price in cents' },
        inStockOnly: { type: 'boolean', description: 'Exclude products with no stock' },
        limit: { type: 'number', description: 'How many results to return, default 6, max 12' },
      },
      required: ['query'],
    },
    input: z.object({
      query: z.string().min(1),
      category: categoryEnum.optional(),
      maxPriceCents: z.number().int().positive().optional(),
      minPriceCents: z.number().int().nonnegative().optional(),
      inStockOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(12).optional(),
    }),
  },
  {
    name: 'get_product_details',
    label: 'Reading the catalogue record',
    description: 'Read one catalogue record by product id. Use it to confirm specs, price and stock before quoting them.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'Catalogue product id' } },
      required: ['productId'],
    },
    input: z.object({ productId: z.string().min(1) }),
  },
  {
    name: 'compare_products',
    label: 'Comparing specifications',
    description:
      'Compare two to four catalogue products side by side. Returns shared specification rows, price positions and requirement checks. No invented values.',
    parameters: {
      type: 'object',
      properties: {
        productIds: { type: 'array', items: { type: 'string' }, description: 'Catalogue ids to compare, 2 to 4' },
        requirements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Requirements to check each product against, e.g. "16 GB RAM", "dedicated GPU", "Linux"',
        },
      },
      required: ['productIds'],
    },
    input: z.object({
      productIds: z.array(z.string().min(1)).min(2).max(4),
      requirements: z.array(z.string().min(1)).max(8).optional(),
    }),
  },
  {
    name: 'check_budget',
    label: 'Checking budget',
    description:
      'Check an amount against the buyer policy budget, or check the current cart total if no amount is given.',
    parameters: {
      type: 'object',
      properties: {
        amountCents: { type: 'number', description: 'Amount in cents to test. Omit to test the current cart' },
      },
    },
    input: z.object({ amountCents: z.number().int().nonnegative().optional() }),
  },
  {
    name: 'check_product_compatibility',
    label: 'Testing requirements',
    description:
      'Check one product against stated requirements such as RAM, GPU, storage, Linux, weight or noise cancelling. Returns evidence from the catalogue record.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        requirements: { type: 'array', items: { type: 'string' } },
      },
      required: ['productId', 'requirements'],
    },
    input: z.object({
      productId: z.string().min(1),
      requirements: z.array(z.string().min(1)).min(1).max(8),
    }),
  },
  {
    name: 'add_to_cart',
    label: 'Adding to cart',
    description:
      'Add a catalogue product to the signed-in buyer cart. Validate the product id with search_products or get_product_details first.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'number', description: 'Quantity, default 1' },
      },
      required: ['productId'],
    },
    input: z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(10).optional() }),
  },
  {
    name: 'remove_from_cart',
    label: 'Removing from cart',
    description: 'Remove a product from the cart by catalogue product id.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
    input: z.object({ productId: z.string().min(1) }),
  },
  {
    name: 'get_cart',
    label: 'Reading the cart',
    description: 'Read the current cart with line items, stock status and totals.',
    parameters: { type: 'object', properties: {} },
    input: z.object({}),
  },
  {
    name: 'calculate_cart',
    label: 'Calculating totals',
    description:
      'Recalculate the cart from the database and check it against the buyer purchasing policy. Returns totals and any violations.',
    parameters: { type: 'object', properties: {} },
    input: z.object({}),
  },
  {
    name: 'prepare_checkout',
    label: 'Preparing approval',
    description:
      'Validate the cart, lock in its prices and create a purchase approval request. This never charges anyone. The buyer must approve it and pay in PayPal themselves.',
    parameters: { type: 'object', properties: {} },
    input: z.object({}),
  },
];

export const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));

export interface ToolContext {
  userId: string;
  sessionId: string;
}

export function cartSummary(cart: Awaited<ReturnType<typeof readCart>>) {
  return {
    items: cart.items.map((item) => ({
      itemId: item.id,
      productId: item.productId,
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      available: item.available,
    })),
    totals: cart.totals,
    violations: cart.violations,
    canCheckout: cart.canCheckout,
    budgetRemainingCents: cart.budgetRemainingCents,
  };
}

async function findReusableOrder(userId: string, cartId: string, totalCents: number): Promise<OrderRow | null> {
  return db.one<OrderRow>(
    `SELECT * FROM orders WHERE user_id = ? AND cart_id = ? AND status = 'awaiting_approval' AND total_cents = ?
     ORDER BY created_at DESC LIMIT 1`,
    [userId, cartId, totalCents],
  );
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const spec = toolByName.get(name);
  if (!spec) return { ok: false, error: `Unknown tool: ${name}. Available tools: ${TOOLS.map((t) => t.name).join(', ')}` };

  const parsed = spec.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input for ${name}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
    };
  }
  const input = parsed.data as Record<string, any>;

  try {
    switch (name) {
      case 'search_products': {
        const results = await searchProducts({
          q: input.query,
          category: input.category,
          maxPriceCents: input.maxPriceCents,
          minPriceCents: input.minPriceCents,
          inStockOnly: input.inStockOnly ?? true,
          limit: input.limit ?? 6,
        });
        return {
          ok: true,
          output: {
            count: results.length,
            query: input.query,
            category: input.category ?? null,
            budgetCents: input.maxPriceCents ?? null,
            products: results.map(productSnapshot),
            note: results.length === 0 ? 'No catalogue record matched. Try a broader query or raise the budget.' : undefined,
          },
        };
      }

      case 'get_product_details': {
        const product = await getProduct(input.productId);
        if (!product) return { ok: false, error: `No catalogue product with id ${input.productId}` };
        return { ok: true, output: productSnapshot(product) };
      }

      case 'compare_products': {
        const products = await getProductsByIds(input.productIds);
        if (products.length < 2) {
          return { ok: false, error: `Need at least two valid product ids, found ${products.length}` };
        }
        const requirements: string[] = input.requirements ?? [];
        const specKeys: string[] = [];
        for (const product of products) {
          for (const key of Object.keys(product.specs)) {
            if (!specKeys.includes(key)) specKeys.push(key);
          }
        }
        const cheapest = [...products].sort((a, b) => a.priceCents - b.priceCents)[0];
        const rows = specKeys.map((key) => ({
          spec: key,
          values: products.map((product) => ({
            productId: product.id,
            name: `${product.brand} ${product.name}`,
            value: product.specs[key] ?? 'Not listed',
          })),
        }));
        return {
          ok: true,
          output: {
            products: products.map((product) => ({
              id: product.id,
              name: `${product.brand} ${product.name}`,
              priceCents: product.priceCents,
              price: `$${(product.priceCents / 100).toFixed(2)}`,
              stock: product.stock,
              rating: product.rating,
              pros: product.pros,
              cons: product.cons,
              requirementChecks: requirements.length ? checkRequirements(product, requirements) : undefined,
            })),
            dimensions: rows,
            cheapestId: cheapest.id,
            priceSpreadCents: Math.max(...products.map((p) => p.priceCents)) - cheapest.priceCents,
          },
        };
      }

      case 'check_budget': {
        const policy = await getPolicy(ctx.userId);
        const cart = await readCart(ctx.userId);
        const amount = typeof input.amountCents === 'number' ? input.amountCents : cart.totals.totalCents;
        const over = amount - policy.maxBudgetCents;
        return {
          ok: true,
          output: {
            amountCents: amount,
            budgetCents: policy.maxBudgetCents,
            withinBudget: over <= 0,
            remainingCents: Math.max(0, -over),
            overByCents: Math.max(0, over),
            source: typeof input.amountCents === 'number' ? 'explicit amount' : 'current cart total',
          },
        };
      }

      case 'check_product_compatibility': {
        const product = await getProduct(input.productId);
        if (!product) return { ok: false, error: `No catalogue product with id ${input.productId}` };
        const result = checkRequirements(product, input.requirements);
        return {
          ok: true,
          output: {
            productId: product.id,
            name: `${product.brand} ${product.name}`,
            satisfied: result.met,
            total: result.checks.length,
            checks: result.checks,
            unmet: result.unmet,
          },
        };
      }

      case 'add_to_cart': {
        const product = await getProduct(input.productId);
        if (!product) return { ok: false, error: `No catalogue product with id ${input.productId}` };
        const cart = await addItem(ctx.userId, product.id, input.quantity ?? 1);
        return {
          ok: true,
          output: {
            added: { productId: product.id, name: `${product.brand} ${product.name}`, quantity: input.quantity ?? 1 },
            cart: cartSummary(cart),
          },
        };
      }

      case 'remove_from_cart': {
        const cart = await removeByProduct(ctx.userId, input.productId);
        return { ok: true, output: { removedProductId: input.productId, cart: cartSummary(cart) } };
      }

      case 'get_cart': {
        const cart = await readCart(ctx.userId);
        return { ok: true, output: cartSummary(cart) };
      }

      case 'calculate_cart': {
        const cart = await readCart(ctx.userId);
        return {
          ok: true,
          output: {
            ...cartSummary(cart),
            policy: {
              maxBudgetCents: cart.policy.maxBudgetCents,
              maxQuantity: cart.policy.maxQuantity,
              allowedCategories: cart.policy.allowedCategories,
              blockedCategories: cart.policy.blockedCategories,
              requireApproval: cart.policy.requireApproval,
            },
          },
        };
      }

      case 'prepare_checkout': {
        const cart = await readCart(ctx.userId);
        if (cart.items.length === 0) return { ok: false, error: 'The cart is empty, so there is nothing to approve.' };
        if (cart.violations.length > 0) {
          return {
            ok: false,
            error: 'The cart does not satisfy the purchasing policy.',
            output: { violations: cart.violations, totals: cart.totals },
          };
        }
        const reusable = await findReusableOrder(ctx.userId, cart.id, cart.totals.totalCents);
        const created = reusable ? null : await createOrderFromCart(ctx.userId);
        const order = reusable ?? (await db.one<OrderRow>(`SELECT * FROM orders WHERE id = ?`, [created!.id]))!;
        const items = await db.query<OrderItemRow>(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
        return {
          ok: true,
          output: {
            approvalRequired: true,
            charged: false,
            order: toOrderView(order, items),
            approvePath: `/approval/${order.id}`,
            nextStep:
              'The buyer must open the approval sheet and approve. No payment is taken until they approve in PayPal.',
          },
        };
      }

      default:
        return { ok: false, error: `Tool ${name} is not implemented` };
    }
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : 'Tool execution failed' };
  }
}

export interface ToolLogEntry {
  id: string;
  sessionId: string;
  step: number;
  tool: string;
  label: string;
  input: unknown;
  output: unknown;
  status: 'ok' | 'error';
  error?: string;
  durationMs: number;
  createdAt: string;
}

export async function logToolExecution(entry: Omit<ToolLogEntry, 'id' | 'createdAt'>): Promise<ToolLogEntry> {
  const record: ToolLogEntry = { ...entry, id: newId(), createdAt: nowIso() };
  await db.query(
    `INSERT INTO agent_tool_executions (id, session_id, step, tool_name, input, output, status, error, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.sessionId,
      record.step,
      record.tool,
      JSON.stringify(record.input ?? {}),
      JSON.stringify(record.output ?? {}),
      record.status,
      record.error ?? null,
      record.durationMs,
      record.createdAt,
    ],
  );
  return record;
}

export function stepLabel(name: string): string {
  return toolByName.get(name)?.label ?? name;
}

export function asCents(value: unknown): number {
  return asInt(value);
}
