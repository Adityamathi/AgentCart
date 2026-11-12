export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  priceCents: number;
  currency: string;
  stock: number;
  rating: number;
  specs: Record<string, string>;
  tags: string[];
  pros: string[];
  cons: string[];
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  brand: string;
  category: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
  available: boolean;
}

export interface Policy {
  maxBudgetCents: number;
  maxQuantity: number;
  allowedCategories: string[];
  blockedCategories: string[];
  requireApproval: boolean;
  updatedAt: string | null;
}

export interface CartTotals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  totals: CartTotals;
  policy: Policy;
  violations: { code: string; message: string }[];
  canCheckout: boolean;
  budgetRemainingCents: number;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  brand: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface Order {
  id: string;
  status: 'awaiting_approval' | 'paypal_created' | 'paid' | 'failed' | 'cancelled';
  items: OrderItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  payerEmail: string | null;
  approvalNote: string | null;
  failureReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  payment: { status: string; providerCaptureId: string | null; amountCents: number; currency: string } | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface ShoppingMemory {
  preferred_brands?: string[];
  notes?: string[];
  updatedAt?: string;
}

export interface Integrations {
  ai: {
    provider: 'gemini' | 'openai' | 'groq' | 'heuristic';
    model: string;
    live: boolean;
    configured: boolean;
    chain?: string[];
  };
  paypal: {
    configured: boolean;
    clientId: string | null;
    currency: string;
    environment: string;
    webhookConfigured: boolean;
  };
  database: { driver: string; ok?: boolean };
}

export interface MeResponse {
  user: User;
  memory: ShoppingMemory;
  policy: Policy;
  integrations: Integrations;
}

export interface ToolExecution {
  id: string;
  step: number;
  tool: string;
  label: string;
  status: 'ok' | 'error';
  input: unknown;
  output: any;
  error?: string | null;
  durationMs: number;
  createdAt: string;
}

export interface AgentTurn {
  sessionId: string;
  reply: string;
  provider: string;
  model: string;
  executions: ToolExecution[];
  cart: Cart;
  approval: { orderId: string; totalCents: number } | null;
}

export interface ComparisonResult {
  products: Array<{
    id: string;
    name: string;
    priceCents: number;
    price: string;
    stock: number;
    rating: number;
    pros: string[];
    cons: string[];
    requirementChecks?: {
      checks: Array<{ requirement: string; satisfied: boolean; evidence: string }>;
      met: number;
      unmet: string[];
    };
  }>;
  dimensions: Array<{ spec: string; values: Array<{ productId: string; name: string; value: string }> }>;
  cheapestId: string;
  priceSpreadCents: number;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (data as any)?.error ?? `Request failed (${response.status})`,
      (data as any)?.code ?? 'request_failed',
      (data as any)?.details,
    );
  }
  return data as T;
}

export const api = {
  me: () => request<MeResponse>('/auth/me'),
  login: (body: { email: string; password: string }) =>
    request<{ user: User; policy: Policy; integrations: Integrations }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  register: (body: { email: string; password: string; name: string }) =>
    request<{ user: User; policy: Policy; integrations: Integrations }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  products: (params: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    return request<{ products: Product[]; total: number; brands: string[]; categories: { id: string; label: string }[] }>(
      `/products?${query.toString()}`,
    );
  },
  product: (id: string) => request<{ product: Product }>(`/products/${id}`),
  compare: (body: { ids: string[]; requirements?: string[] }) =>
    request<ComparisonResult>('/products/compare', { method: 'POST', body: JSON.stringify(body) }),

  cart: () => request<{ cart: Cart }>('/cart'),
  addToCart: (productId: string, quantity = 1) =>
    request<{ cart: Cart }>('/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  setQuantity: (itemId: string, quantity: number) =>
    request<{ cart: Cart }>(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
  removeItem: (itemId: string) => request<{ cart: Cart }>(`/cart/items/${itemId}`, { method: 'DELETE' }),
  clearCart: () => request<{ cart: Cart }>('/cart/clear', { method: 'POST' }),
  validateCart: () => request<{ valid: boolean; cart: Cart }>('/cart/validate', { method: 'POST' }),

  policy: () => request<{ policy: Policy; categories: { id: string; label: string }[] }>('/policies'),
  savePolicy: (body: Omit<Policy, 'updatedAt'>) =>
    request<{ policy: Policy }>('/policies', { method: 'POST', body: JSON.stringify(body) }),

  orders: () => request<{ orders: Order[] }>('/orders'),
  order: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  createOrder: (note?: string) =>
    request<{ order: Order }>('/orders', { method: 'POST', body: JSON.stringify({ note }) }),
  cancelOrder: (id: string) => request<{ order: Order }>(`/orders/${id}/cancel`, { method: 'POST' }),

  paypalConfig: () =>
    request<{
      configured: boolean;
      clientId: string | null;
      currency: string;
      environment: string;
      sdkUrl: string;
    }>('/paypal/config'),
  paypalCreate: (orderId: string) =>
    request<{ paypalOrderId: string; status: string; approveUrl: string | null }>('/paypal/create-order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),
  paypalCapture: (orderId: string) =>
    request<{ order: Order; alreadyPaid: boolean; paypalStatus?: string }>('/paypal/capture-order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),

  activity: () =>
    request<{
      executions: Array<ToolExecution & { sessionId: string; sessionTitle: string }>;
      sessions: Array<{ id: string; title: string; created_at: string; updated_at: string }>;
    }>('/agent/activity'),
  session: (id: string) => request<any>(`/agent/sessions/${id}`),

  memory: () => request<{ memory: ShoppingMemory }>('/settings/memory'),
  saveMemory: (body: ShoppingMemory) =>
    request<{ memory: ShoppingMemory }>('/settings/memory', { method: 'PUT', body: JSON.stringify(body) }),
  health: () =>
    request<{
      ok: boolean;
      catalogueProducts: number;
      ai: Integrations['ai'];
      paypal: Integrations['paypal'];
      database: Integrations['database'];
      time: string;
    }>('/health'),
};

export interface StreamEvent {
  type: 'status' | 'tool_start' | 'tool_result' | 'message' | 'done' | 'error' | 'result';
  [key: string]: any;
}

/** Streams an agent turn over SSE. Returns the final turn result. */
export async function streamAgentTurn(
  body: { message: string; sessionId?: string | null },
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<AgentTurn | null> {
  const response = await fetch('/api/agent/chat?stream=1', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    let message = `The agent request failed (${response.status})`;
    try {
      message = JSON.parse(text)?.error ?? message;
    } catch {
      /* keep default */
    }
    throw new ApiError(response.status, message, 'stream_failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AgentTurn | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
      if (!line) continue;
      let event: StreamEvent;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.type === 'result') result = event.result as AgentTurn;
      onEvent(event);
    }
  }
  return result;
}
