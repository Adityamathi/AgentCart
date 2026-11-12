import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/http.js';
import { searchProducts, getProduct, brands } from '../services/catalog.js';
import { categories, categoryLabels } from '../catalog/products.js';
import { attachUser, requireAuth } from '../middleware/auth.js';
import { executeTool } from '../agent/tools.js';

export const productsRouter = Router();

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  inStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'name']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    if (query.category && !categories.includes(query.category as never)) {
      throw new HttpError(400, `Unknown category "${query.category}"`, 'bad_category');
    }
    const products = await searchProducts({
      q: query.q,
      category: query.category,
      brands: query.brand ? [query.brand] : undefined,
      minPriceCents: query.minPrice,
      maxPriceCents: query.maxPrice,
      inStockOnly: query.inStock === 'true',
      sort: query.sort,
      limit: query.limit,
    });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      products,
      total: products.length,
      categories: categories.map((id) => ({ id, label: categoryLabels[id] })),
      brands: await brands(),
      catalogue: 'sample-records',
    });
  }),
);

/** Deterministic comparison used by the comparison screen and the agent tool. */
productsRouter.post(
  '/compare',
  attachUser,
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(2).max(4),
        requirements: z.array(z.string().min(1)).max(8).optional(),
      })
      .parse(req.body ?? {});
    const result = await executeTool(
      'compare_products',
      { productIds: body.ids, requirements: body.requirements },
      { userId: req.user!.id, sessionId: 'compare-page' },
    );
    if (!result.ok) throw new HttpError(422, result.error ?? 'Comparison failed', 'compare_failed');
    res.json(result.output);
  }),
);

productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await getProduct(req.params.id);
    if (!product) throw new HttpError(404, 'Product not found', 'product_not_found');
    res.json({ product, catalogue: 'sample-records' });
  }),
);
