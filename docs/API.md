# API reference

Base URL: `/api`. All responses are JSON. Authenticated routes use the `agentcart_session` httpOnly cookie.

Errors use `{ "error": "human message", "code": "machine_code", "details"?: … }` with a matching HTTP status.

## Health

```
GET /api/health
200 {
  ok: true,
  time: "2026-11-11T18:04:00.000Z",
  catalogueProducts: 39,
  ai: { provider: "gemini", model: "gemini-3.5-flash", live: true, configured: true, chain: ["gemini", "groq"] },
  paypal: { configured: true, clientId: "AeA…", currency: "USD", environment: "sandbox", webhookConfigured: true },
  database: { driver: "sqlite", ok: true }
}
```

## Auth

```
POST /api/auth/register  { email, password, name }
201 { user, policy, integrations }
POST /api/auth/login     { email, password }
200 { user, policy, memory, integrations }
POST /api/auth/logout
200 { ok: true }
GET  /api/auth/me
200 { user, memory, policy, integrations }
```

Passwords use scrypt. Sessions live 30 days and are stored hashed.

## Catalogue

```
GET /api/products?q=laptop&category=laptops&brand=Lenovo&minPrice=50000&maxPrice=120000&inStock=true&sort=price_asc&limit=24
200 { products: Product[], total, categories: [{ id, label }], brands: string[], catalogue: "sample-records" }

GET /api/products/:id
200 { product: Product }
404 { error, code: "product_not_found" }

POST /api/products/compare        (auth)
{ ids: ["lenovo-loq-15","acer-nitro-v15"], requirements: ["16 GB RAM","dedicated GPU"] }
200 {
  products: [{ id, name, priceCents, price, stock, rating, pros, cons, requirementChecks? }],
  dimensions: [{ spec: "cpu", values: [{ productId, name, value }] }],
  cheapestId, priceSpreadCents
}
```

`Product` = `{ id, sku, name, brand, category, description, priceCents, currency, stock, rating, specs, tags, pros, cons }`.

## Cart

All cart routes require auth and return the full recalculated cart.

```
GET    /api/cart
POST   /api/cart/add            { productId, quantity = 1 }       201
PATCH  /api/cart/items/:id      { quantity }                      200   (0 removes)
DELETE /api/cart/items/:id                                        200
POST   /api/cart/validate                                         200 { valid, cart, violations?, totals }
POST   /api/cart/clear                                            200
```

`Cart` = `{ id, items, totals, policy, violations, canCheckout, budgetRemainingCents, updatedAt }`.
Violations: `budget_exceeded`, `quantity_exceeded`, `category_blocked`, `category_not_allowed`, `insufficient_stock`.

## Policies

```
GET  /api/policies
200 { policy, categories: [{ id, label }] }

POST /api/policies
{ maxBudgetCents, maxQuantity, allowedCategories, blockedCategories, requireApproval }
200 { policy }
```

## Agent

```
POST /api/agent/chat                 (auth)
{ message, sessionId? }
200 AgentTurn | text/event-stream

POST /api/agent/chat?stream=1
Accept: text/event-stream
data: {"type":"status","message":"Reading your request"}
data: {"type":"tool_start","step":1,"tool":"search_products","label":"Searching the catalogue"}
data: {"type":"tool_result","step":1,"tool":"search_products","status":"ok","durationMs":7,"summary":"6 catalogue matches"}
data: {"type":"message","content":"…"}
data: {"type":"done","sessionId":"…"}
data: {"type":"result","result": AgentTurn}

POST /api/agent/execute              (auth)
{ tool: "calculate_cart", input: {}, sessionId? }
200 { tool, label, ok, output } | 422 { tool, label, ok: false, error }

GET /api/agent/activity              (auth)
200 {
  executions: [{ id, sessionId, sessionTitle, step, tool, label, status, input, output, error, durationMs, createdAt }],
  sessions: [{ id, title, created_at, updated_at }]
}

GET /api/agent/sessions/:id          (auth)
200 { session, messages, executions }

GET /api/agent/tools                 (auth)
200 { tools: [{ name, label, description, parameters }] }
```

`AgentTurn` = `{ sessionId, reply, provider, model, executions, cart, approval }` where `approval` is
`{ orderId, totalCents } | null`.

## Orders

```
POST /api/orders            (auth)   { note? }
201 { order }                        409 policy_violation | 400 empty_cart

GET  /api/orders            (auth)
200 { orders: Order[] }

GET  /api/orders/:id        (auth)
200 { order }

POST /api/orders/:id/cancel (auth)
200 { order }
```

`Order` = `{ id, status, items, subtotalCents, shippingCents, taxCents, totalCents, currency, paypalOrderId,
paypalCaptureId, payerEmail, approvalNote, failureReason, createdAt, approvedAt, paidAt, payment }`.

## PayPal

```
GET  /api/paypal/config
200 { configured, clientId | null, currency, environment, sdkUrl }

POST /api/paypal/create-order   (auth)  { orderId }
201 { paypalOrderId, status, approveUrl, reused }     503 paypal_not_configured
200 { paypalOrderId, status, approveUrl, reused: true } when an order already exists

POST /api/paypal/capture-order  (auth)  { orderId }
200 { order, alreadyPaid, paypalStatus }
402 capture_incomplete | 409 amount_mismatch | 409 already_paid | 502 paypal_request_failed

POST /api/paypal/webhook        (raw JSON, PayPal signature headers)
200 { received: true } | { received: true, duplicate: true }
400 bad_signature | 503 webhook_not_configured
```

The webhook is mounted before `express.json` so the raw body can be forwarded to
`/v1/notifications/verify-webhook-signature`. Event ids are unique in `payment_events`.

## Settings

```
GET    /api/settings/memory     (auth)   200 { memory }
PUT    /api/settings/memory     (auth)   { notes?: string[], preferred_brands?: string[] }   200 { memory }
DELETE /api/settings/memory     (auth)   200 { memory }
GET    /api/settings/overview   (auth)   200 { policy, memory }
```

## Status codes used

`400` bad request / validation, `401` unauthenticated, `403` foreign origin, `404` not found, `409` conflict
(stock, policy, already paid), `402` PayPal capture incomplete, `422` tool or comparison refused, `429` rate limited,
`502` PayPal/upstream failure, `503` integration not configured.
