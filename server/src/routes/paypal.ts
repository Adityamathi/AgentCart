import { Router } from 'express';
import { env, paypalConfigured } from '../env.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { paypalOrderSchema } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import {
  attachPaypalOrder,
  failOrder,
  findOrderByPaypalId,
  getOrder,
  getOrderRow,
  recordPaymentEvent,
  settleOrder,
} from '../services/orders.js';
import {
  capturePayPalOrder,
  createPayPalOrder,
  extractCapture,
  getPayPalOrder,
  verifyWebhookSignature,
  type PayPalOrderResponse,
} from '../services/paypal.js';

export const paypalRouter = Router();
export const paypalWebhookRouter = Router();

paypalRouter.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({
    configured: paypalConfigured,
    clientId: paypalConfigured ? env.paypalClientId : null,
    currency: env.paypalCurrency,
    environment: env.paypalBaseUrl.includes('sandbox') ? 'sandbox' : 'live',
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${paypalConfigured ? encodeURIComponent(env.paypalClientId) : 'test'}&currency=${env.paypalCurrency}&intent=capture&components=buttons`,
  });
});

paypalRouter.use(requireAuth);

paypalRouter.post(
  '/create-order',
  asyncHandler(async (req, res) => {
    if (!paypalConfigured) {
      throw new HttpError(
        503,
        'PayPal sandbox keys are not set on the server. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, then restart.',
        'paypal_not_configured',
      );
    }
    const { orderId } = paypalOrderSchema.parse(req.body);
    const order = await getOrderRow(orderId);
    if (!order || order.user_id !== req.user!.id) {
      throw new HttpError(404, 'Order not found', 'order_not_found');
    }
    if (order.status === 'paid') {
      throw new HttpError(409, 'This order is already paid', 'already_paid');
    }
    if (order.status === 'cancelled') {
      throw new HttpError(409, 'This order was cancelled. Create a new approval from the cart.', 'order_cancelled');
    }

    if (order.paypal_order_id && order.status === 'paypal_created') {
      const existing = await getPayPalOrder(order.paypal_order_id);
      const approve = existing.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve');
      res.json({ paypalOrderId: existing.id, status: existing.status, approveUrl: approve?.href ?? null, reused: true });
      return;
    }

    const created = await createPayPalOrder({
      amountCents: Number(order.total_cents),
      currency: order.currency,
      referenceId: order.id,
      description: `AgentCart order ${order.id.slice(0, 8)}`,
    });
    await attachPaypalOrder(order.id, created.id);
    const approve = created.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve');
    res.status(201).json({
      paypalOrderId: created.id,
      status: created.status,
      approveUrl: approve?.href ?? null,
      reused: false,
    });
  }),
);

paypalRouter.post(
  '/capture-order',
  asyncHandler(async (req, res) => {
    if (!paypalConfigured) {
      throw new HttpError(503, 'PayPal is not configured on the server', 'paypal_not_configured');
    }
    const { orderId } = paypalOrderSchema.parse(req.body);
    const order = await getOrderRow(orderId);
    if (!order || order.user_id !== req.user!.id) {
      throw new HttpError(404, 'Order not found', 'order_not_found');
    }
    if (order.status === 'paid') {
      const view = await getOrder(req.user!.id, order.id);
      res.json({ order: view, alreadyPaid: true });
      return;
    }
    if (!order.paypal_order_id) {
      throw new HttpError(400, 'Create the PayPal order before capturing it', 'no_paypal_order');
    }

    let paypalOrder: PayPalOrderResponse;
    try {
      paypalOrder = await capturePayPalOrder(order.paypal_order_id);
    } catch (error) {
      // A retried capture returns ORDER_ALREADY_CAPTURED; read the real state instead.
      const maybeStatus = error instanceof HttpError ? (error.details as any)?.details?.[0]?.issue : undefined;
      if (maybeStatus === 'ORDER_ALREADY_CAPTURED') {
        paypalOrder = await getPayPalOrder(order.paypal_order_id);
      } else {
        await failOrder(order.id, error instanceof Error ? error.message : 'PayPal capture failed');
        throw error;
      }
    }

    const capture = extractCapture(paypalOrder);
    const settled = await settleOrder({ order, capture, paypalOrder, source: 'capture' });
    await recordPaymentEvent({
      eventId: `capture:${capture?.id ?? paypalOrder.id}`,
      eventType: 'CAPTURE_SETTLED',
      orderId: order.id,
      payload: { source: 'capture', paypalOrderId: paypalOrder.id, captureId: capture?.id },
    });

    const view = await getOrder(req.user!.id, order.id);
    res.json({ order: view, alreadyPaid: settled.alreadyPaid, paypalStatus: paypalOrder.status });
  }),
);

/**
 * PayPal webhook receiver. Mounted before the JSON parser so the raw body can
 * be forwarded to PayPal for signature verification.
 */
paypalWebhookRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Body is not JSON', 'bad_webhook_body');
    }

    if (!env.paypalWebhookId) {
      res.status(503).json({ error: 'PAYPAL_WEBHOOK_ID is not set, so signatures cannot be verified', code: 'webhook_not_configured' });
      return;
    }

    const verified = await verifyWebhookSignature({
      headers: {
        'paypal-auth-algo': req.get('paypal-auth-algo'),
        'paypal-cert-url': req.get('paypal-cert-url'),
        'paypal-transmission-id': req.get('paypal-transmission-id'),
        'paypal-transmission-sig': req.get('paypal-transmission-sig'),
        'paypal-transmission-time': req.get('paypal-transmission-time'),
      },
      body: event,
    });
    if (!verified) {
      res.status(400).json({ error: 'Webhook signature verification failed', code: 'bad_signature' });
      return;
    }

    const orderIdFromEvent: string | undefined =
      event?.resource?.supplementary_data?.related_ids?.order_id ??
      event?.resource?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const fresh = await recordPaymentEvent({
      eventId: String(event.id ?? `${event.event_type}:${orderIdFromEvent}`),
      eventType: String(event.event_type ?? 'unknown'),
      orderId: orderIdFromEvent ?? null,
      payload: event,
    });
    if (!fresh) {
      res.json({ received: true, duplicate: true });
      return;
    }

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const paypalOrderId = event?.resource?.supplementary_data?.related_ids?.order_id;
      const order = paypalOrderId ? await findOrderByPaypalId(paypalOrderId) : null;
      if (order && order.status !== 'paid') {
        const capture = {
          id: event.resource.id,
          status: event.resource.status,
          amount: event.resource.amount,
          payer: event.resource.payer,
        } as any;
        try {
          await settleOrder({
            order,
            capture,
            paypalOrder: { id: paypalOrderId, status: 'COMPLETED' },
            source: 'webhook',
          });
        } catch (error) {
          console.error('[paypal] webhook settle failed', error instanceof Error ? error.message : error);
        }
      }
    }

    res.json({ received: true });
  }),
);
