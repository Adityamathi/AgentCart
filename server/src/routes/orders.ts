import { Router } from 'express';
import { asyncHandler, HttpError } from '../lib/http.js';
import { createOrderSchema } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { cancelOrder, createOrderFromCart, getOrder, listOrders } from '../services/orders.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ orders: await listOrders(req.user!.id) });
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await getOrder(req.user!.id, req.params.id);
    if (!order) throw new HttpError(404, 'Order not found', 'order_not_found');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ order });
  }),
);

/** Creates the approval request from the server cart. It charges nothing. */
ordersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createOrderSchema.parse(req.body ?? {});
    const order = await createOrderFromCart(req.user!.id, body.note);
    res.status(201).json({ order });
  }),
);

ordersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const order = await cancelOrder(req.user!.id, req.params.id);
    if (!order) throw new HttpError(404, 'Order not found', 'order_not_found');
    res.json({ order });
  }),
);
