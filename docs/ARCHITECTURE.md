# Architecture

## Shape of the system

```
Browser (React 18 + Vite + Tailwind)
  │  cookie session (httpOnly, DB-backed)
  │  fetch /api/*  ← Vite proxy in development, same origin in production
  ▼
Express API (TypeScript, ESM)
  ├─ middleware: helmet, CORS allowlist, JSON, cookies, same-origin on mutations, rate limits
  ├─ auth        routes/auth.ts        scrypt passwords, sessions in `auth_sessions`
  ├─ catalogue   routes/products.ts    search, filter, compare
  ├─ cart        routes/cart.ts        server-computed totals + policy evaluation
  ├─ policies    routes/policies.ts    buyer-owned limits
  ├─ orders      routes/orders.ts      approval snapshots
  ├─ paypal      routes/paypal.ts      Orders v2, capture, webhook verification
  ├─ settings    routes/settings.ts    shopping memory
  └─ agent       routes/agent.ts → agent/engine.ts → provider → tools → services
                                     │
                                     ├─ Gemini generateContent (function calling)
                                     ├─ OpenAI chat completions (tools)
                                     └─ local planner (deterministic rules)
  ▼
Database adapter (db/index.ts)
  ├─ node:sqlite file  (default: server/data/agentcart.db)
  └─ pg Pool           (when DATABASE_URL is set: Supabase / Render Postgres)
```

The database layer uses one portable schema (`db/schema.sql`) and a tiny adapter that converts `?` placeholders to
`$n` for Postgres. Money is integer cents, timestamps are ISO text, structured values are JSON text.

## Request flow: a shopping run

1. `POST /api/agent/chat` (SSE when `?stream=1`).
2. `runAgentTurn` loads or creates `agent_sessions`, stores the user message, reads the last turns and the buyer's
   saved memory, then calls the provider.
3. The provider emits tool calls. `deps.executeTool` validates input with Zod, executes the tool, writes an
   `agent_tool_executions` row (input, output, status, duration) and emits `tool_start` / `tool_result` events.
4. When the provider returns text, the reply is stored as an assistant message and the session state (last search ids,
   requirements, budget) is persisted so "choose 2" works on the next turn.
5. The response includes the tool executions, the current cart and any open approval.

The SSE stream is a real stream of the events as they happen; the transcript's completed steps are the logged rows, not
a replay of a script.

## Agent tool surface

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `search_products` | read | Free text, category, price ceiling, stock filter |
| `get_product_details` | read | One catalogue record |
| `compare_products` | read | 2–4 records, shared spec rows, requirement checks |
| `check_budget` | read | Cart or explicit amount against the policy budget |
| `check_product_compatibility` | read | Requirement matching with catalogue evidence |
| `add_to_cart` | write | Validates product, stock and quantity |
| `remove_from_cart` | write | Removes one product |
| `get_cart` | read | Lines, stock, totals |
| `calculate_cart` | read | Recompute totals, evaluate policy |
| `prepare_checkout` | write | Creates/reuses an `awaiting_approval` order; charges nothing |

Limits: 14 tool calls per turn, 6 provider rounds, 60 s provider timeout, 12-result search cap. Unknown tools and
invalid inputs return structured errors the model can read and recover from. No tool reaches PayPal.

## Payment state machine

```
cart ──prepare_checkout / POST /api/orders──► awaiting_approval
                                               │  buyer ticks approval, POST /api/paypal/create-order
                                               ▼
                                          paypal_created ──capture COMPLETED + amount verified──► paid
                                               │                                              │
                                               └── PayPal cancel / capture error ──► failed ◄──┘
buyer cancels ──► cancelled
```

Guards:

- `create-order` requires ownership, a non-paid, non-cancelled order and configured keys; it reuses an existing
  `paypal_created` order rather than creating duplicates.
- `capture-order` loads the order, calls PayPal, requires `COMPLETED`, compares the captured amount and currency with
  the order snapshot, then settles in one transaction: stock decrement, order `paid`, `payments` row, cart cleared.
- Replays return `alreadyPaid: true` without touching stock.
- `webhook` receives the raw body before the JSON parser, verifies via `/v1/notifications/verify-webhook-signature`
  with `PAYPAL_WEBHOOK_ID`, deduplicates on `payment_events.event_id` (unique) and settles `PAYMENT.CAPTURE.COMPLETED`.
- `PAYPAL_CLIENT_SECRET` never leaves the server. The browser gets only the public client id.

## Security and ownership

- Passwords: scrypt with a random salt; sessions are 32-byte tokens, stored as SHA-256(${token}:${SESSION_SECRET}),
  scoped by expiry, sent in an httpOnly `SameSite=Lax` cookie (Secure in production).
- Every user-data query is scoped by `req.user.id`; order and cart lookups include `user_id` in the predicate.
- Mutating requests with a foreign `Origin` are rejected with 403. CORS only allows `APP_ORIGIN` and local ports.
- Rate limits per IP: 240/min global, 40/15 min auth, 40/min agent, 30/min PayPal.
- `helmet` with CSP disabled because the Vite client is served separately and PayPal's SDK is loaded at runtime.
- The agent never receives SQL or PayPal access; its whole capability surface is the ten tools above.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| AI key missing | Local planner runs; UI and health labels it "local planner" |
| Provider error before any tool ran | Engine falls back to the local planner once |
| Provider error after a tool ran | Turn stops with a message; no cart writes are repeated |
| Model name retired by the provider | Gemini provider walks a short list of current Flash models; a 404, 429 or 503 moves to the next one, then to Groq/OpenAI if those keys exist |
| Provider outage | The next configured provider runs the turn. After a tool has run the turn stops instead, so cart writes are never repeated |
| Invalid product id | Tool returns `No catalogue product with id …`; the model can search again |
| Out of stock | `addItem` and policy evaluation refuse; capture also re-checks stock |
| Policy violation | `prepare_checkout` and `POST /api/orders` return 409 with violations; the planner suggests a cheaper record |
| PayPal not configured | `create-order` returns 503; the checkout page lists the required variables |
| PayPal cancel | No capture, order stays open, message shown |
| Capture/amount mismatch | Order marked failed with the reason; nothing is marked paid |
| Duplicate webhook | `payment_events` unique key short-circuits as `{ duplicate: true }` |
| Network drop mid-stream | The client shows "nothing was charged"; the ledger keeps partial executions |

## Verification performed

- `npm test` — 15 Vitest tests: totals, quantity limits, out-of-stock, budget and blocked-category policy, order
  snapshot totals, capture settlement and stock decrement, capture idempotency, amount mismatch, catalogue search,
  requirement evidence, local planner search → compare → add → prepare approval, tool input validation.
- `npm run typecheck` — server and client.
- `npm run build` — production bundle and compiled server.
- HTTP smoke test against the running app (30 checks): health, unauthenticated 401, login, search and sort, category
  filter, SSE events, agent search/compare, selection, approval creation, server total equality, out-of-stock 409,
  policy save, over-budget validation and order 409, comparison endpoint, PayPal 503 without keys, unsigned webhook
  refusal, foreign-origin write 403, activity ledger, order history.
- Browser review of the landing page, login, workspace, catalogue, comparison, cart, approval and checkout states.

Not verified here: a live PayPal sandbox payment (no credentials) and live Gemini/OpenAI tool calling (no API keys).
Those paths are implemented, typed and unit-tested at their boundaries but not executed against the providers.
