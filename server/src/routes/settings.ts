import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { memorySchema } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { loadMemory, saveShoppingMemory } from '../services/memory.js';
import { getPolicy } from '../services/policies.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get(
  '/memory',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ memory: await loadMemory(req.user!.id) });
  }),
);

settingsRouter.put(
  '/memory',
  asyncHandler(async (req, res) => {
    const input = memorySchema.parse(req.body);
    const memory = await saveShoppingMemory(req.user!.id, {
      preferred_brands: input.preferred_brands ?? [],
      notes: input.notes ?? [],
    });
    res.json({ memory });
  }),
);

settingsRouter.delete(
  '/memory',
  asyncHandler(async (req, res) => {
    res.json({ memory: await saveShoppingMemory(req.user!.id, { preferred_brands: [], notes: [] }) });
  }),
);

settingsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json({ policy: await getPolicy(req.user!.id), memory: await loadMemory(req.user!.id) });
  }),
);
