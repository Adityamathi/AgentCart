import { env, paypalConfigured } from '../env.js';
import { HttpError } from '../lib/http.js';

export interface PayPalOrderResponse {
  id: string;
  status: string;
  links?: { href: string; rel: string; method: string }[];
  purchase_units?: unknown[];
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export function assertPayPalConfigured(): void {
  if (!paypalConfigured) {
    throw new HttpError(
      503,
      'PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the server environment.',
      'paypal_not_configured',
    );
  }
}

async function accessToken(): Promise<string> {
  assertPayPalConfigured();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const basic = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64');
  const response = await fetch(`${env.paypalBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, `PayPal authentication failed (${response.status})`, 'paypal_auth_failed', text.slice(0, 400));
  }
  const data = JSON.parse(text) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function paypalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${env.paypalBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail: unknown = text;
    try {
      detail = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
    throw new HttpError(
      502,
      `PayPal rejected the request (${response.status})`,
      'paypal_request_failed',
      detail,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export function amountString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function createPayPalOrder(input: {
  amountCents: number;
  currency: string;
  referenceId: string;
  description: string;
}): Promise<PayPalOrderResponse> {
  const body = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: input.referenceId,
        description: input.description.slice(0, 127),
        amount: {
          currency_code: input.currency,
          value: amountString(input.amountCents),
        },
      },
    ],
    application_context: {
      brand_name: 'AgentCart',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: `${env.appOrigin}/checkout/return`,
      cancel_url: `${env.appOrigin}/checkout/cancel`,
    },
  };
  return paypalFetch<PayPalOrderResponse>('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getPayPalOrder(id: string): Promise<PayPalOrderResponse> {
  return paypalFetch<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function capturePayPalOrder(id: string): Promise<PayPalOrderResponse> {
  return paypalFetch<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
  payer?: { email_address?: string };
  seller_protection?: unknown;
  create_time?: string;
}

export function extractCapture(order: PayPalOrderResponse): PayPalCapture | null {
  const units = (order.purchase_units ?? []) as Array<{
    payments?: { captures?: PayPalCapture[] };
  }>;
  for (const unit of units) {
    const capture = unit.payments?.captures?.[0];
    if (capture) return capture;
  }
  return null;
}

export async function verifyWebhookSignature(input: {
  headers: Record<string, string | undefined>;
  body: unknown;
}): Promise<boolean> {
  if (!env.paypalWebhookId) return false;
  const verificationBody = {
    auth_algo: input.headers['paypal-auth-algo'],
    cert_url: input.headers['paypal-cert-url'],
    transmission_id: input.headers['paypal-transmission-id'],
    transmission_sig: input.headers['paypal-transmission-sig'],
    transmission_time: input.headers['paypal-transmission-time'],
    webhook_id: env.paypalWebhookId,
    webhook_event: input.body,
  };
  try {
    const result = await paypalFetch<{ verification_status: string }>(
      '/v1/notifications/verify-webhook-signature',
      { method: 'POST', body: JSON.stringify(verificationBody) },
    );
    return result.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('[paypal] webhook verification failed', error instanceof Error ? error.message : error);
    return false;
  }
}
