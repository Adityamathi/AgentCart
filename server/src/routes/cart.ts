import { Router } from 'express';
import { asyncHandler, HttpError } from '../lib/http.js';
import { addCartItemSchema, quantitySchema } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { addItem, readCart, removeItem, setQuantity, clearCart } from '../services/cart.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ cart: await readCart(req.user!.id) });
  }),
);

cartRouter.post(
  '/add',
  asyncHandler(async (req, res) => {
    const body = addCartItemSchema.parse(req.body);
    const cart = await addItem(req.user!.id, body.productId, body.quantity);
    res.status(201).json({ cart });
  }),
);

cartRouter.patch(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const { quantity } = quantitySchema.parse(req.body);
    const cart = await setQuantity(req.user!.id, req.params.id, quantity);
    res.json({ cart });
  }),
);

cartRouter.delete(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const cart = await removeItem(req.user!.id, req.params.id);
    res.json({ cart });
  }),
);

cartRouter.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const cart = await readCart(req.user!.id);
    if (cart.items.length === 0) {
      res.json({ valid: false, cart, reason: 'The cart is empty' });
      return;
    }
    res.json({
      valid: cart.canCheckout,
      cart,
      violations: cart.violations,
      totals: cart.totals,
    });
  }),
);

cartRouter.post(
  '/clear',
  asyncHandler(async (req, res) => {
    res.json({ cart: await clearCart(req.user!.id) });
  }),
);

cartRouter.patch(
  '/items',
  asyncHandler(async () => {
    throw new HttpError(400, 'Include the cart item id in the path', 'bad_request');
  }),
);
