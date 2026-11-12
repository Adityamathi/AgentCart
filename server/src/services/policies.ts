import { db } from '../db/index.js';
import { newId, nowIso, parseJson } from '../lib/util.js';
import { categories } from '../catalog/products.js';
import type { Category, PolicyRecord } from '../types.js';

export interface Policy {
  maxBudgetCents: number;
  maxQuantity: number;
  allowedCategories: Category[];
  blockedCategories: Category[];
  requireApproval: boolean;
  updatedAt: string | null;
}

export interface PolicyInput {
  maxBudgetCents: number;
  maxQuantity: number;
  allowedCategories: Category[];
  blockedCategories: Category[];
  requireApproval: boolean;
}

export const DEFAULT_POLICY: PolicyInput = {
  maxBudgetCents: 100000,
  maxQuantity: 3,
  allowedCategories: [],
  blockedCategories: [],
  requireApproval: true,
};

function validCategories(input: unknown): Category[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is Category => categories.includes(value as Category));
}

export async function getPolicy(userId: string): Promise<Policy> {
  const row = await db.one<PolicyRecord>(`SELECT * FROM purchasing_policies WHERE user_id = ?`, [userId]);
  if (!row) {
    return { ...DEFAULT_POLICY, updatedAt: null };
  }
  return {
    maxBudgetCents: Number(row.max_budget_cents),
    maxQuantity: Number(row.max_quantity),
    allowedCategories: validCategories(parseJson<string[]>(row.allowed_categories, [])),
    blockedCategories: validCategories(parseJson<string[]>(row.blocked_categories, [])),
    requireApproval: Boolean(row.require_approval),
    updatedAt: row.updated_at,
  };
}

export async function savePolicy(userId: string, input: PolicyInput): Promise<Policy> {
  const timestamp = nowIso();
  await db.query(
    `INSERT INTO purchasing_policies (id, user_id, max_budget_cents, max_quantity, allowed_categories, blocked_categories, require_approval, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       max_budget_cents = excluded.max_budget_cents,
       max_quantity = excluded.max_quantity,
       allowed_categories = excluded.allowed_categories,
       blocked_categories = excluded.blocked_categories,
       require_approval = excluded.require_approval,
       updated_at = excluded.updated_at`,
    [
      newId(),
      userId,
      input.maxBudgetCents,
      input.maxQuantity,
      JSON.stringify(input.allowedCategories),
      JSON.stringify(input.blockedCategories),
      input.requireApproval ? 1 : 0,
      timestamp,
    ],
  );
  return getPolicy(userId);
}

export interface PolicyViolation {
  code: string;
  message: string;
}

export interface CartLine {
  productId: string;
  name: string;
  category: Category;
  quantity: number;
  unitPriceCents: number;
  stock: number;
}

/** Server-side policy enforcement. The agent cannot bypass or override this. */
export function evaluatePolicy(
  policy: Policy,
  lines: CartLine[],
  totals: { totalCents: number },
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (lines.length === 0) return violations;

  if (totals.totalCents > policy.maxBudgetCents) {
    violations.push({
      code: 'budget_exceeded',
      message: `Order total ${(totals.totalCents / 100).toFixed(2)} ${'USD'} exceeds the approved budget of ${(policy.maxBudgetCents / 100).toFixed(2)} USD`,
    });
  }

  for (const line of lines) {
    if (line.quantity > policy.maxQuantity) {
      violations.push({
        code: 'quantity_exceeded',
        message: `${line.name} quantity ${line.quantity} exceeds the limit of ${policy.maxQuantity} per item`,
      });
    }
    if (policy.allowedCategories.length > 0 && !policy.allowedCategories.includes(line.category)) {
      violations.push({
        code: 'category_not_allowed',
        message: `${line.name} is in ${line.category}, which is outside the allowed categories`,
      });
    }
    if (policy.blockedCategories.includes(line.category)) {
      violations.push({
        code: 'category_blocked',
        message: `${line.name} is in ${line.category}, which is blocked by policy`,
      });
    }
    if (line.stock < line.quantity) {
      violations.push({
        code: 'insufficient_stock',
        message: `${line.name} has ${line.stock} in stock, fewer than the ${line.quantity} requested`,
      });
    }
  }

  return violations;
}
