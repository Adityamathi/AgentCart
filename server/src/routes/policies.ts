import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { policySchema } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { getPolicy, savePolicy } from '../services/policies.js';
import { categories, categoryLabels } from '../catalog/products.js';

export const policiesRouter = Router();

policiesRouter.use(requireAuth);

policiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      policy: await getPolicy(req.user!.id),
      categories: categories.map((id) => ({ id, label: categoryLabels[id] })),
    });
  }),
);

policiesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = policySchema.parse(req.body);
    const policy = await savePolicy(req.user!.id, {
      maxBudgetCents: input.maxBudgetCents,
      maxQuantity: input.maxQuantity,
      allowedCategories: input.allowedCategories as never,
      blockedCategories: input.blockedCategories as never,
      requireApproval: input.requireApproval,
    });
    res.json({ policy });
  }),
);
