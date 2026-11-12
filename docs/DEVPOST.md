# AgentCart — Devpost submission copy

## Elevator pitch

An AI purchasing agent that turns a shopping request into a policy-checked cart and a PayPal approval you control. It
searches a real catalogue, compares specifications, explains its choice and stops at the payment.

## Inspiration

Online shopping still asks the buyer to do the agent's work: search, open tabs, compare specification tables, check
compatibility, assemble a cart, re-check the budget, then pay. We wanted to see what happens when the model is given
tools instead of a chat box — not a recommender, an agent that finishes the job up to the one step that must stay human:
approval.

## What it does

You describe the purchase in one sentence, including budget and the constraints that matter ("robotics development,
Python, ROS, computer vision, 16 GB RAM, a dedicated GPU, under $1,000"). AgentCart:

1. Reads the brief and extracts category, budget and requirements.
2. Searches a 39-record catalogue through `search_products`.
3. Compares two to four candidates through `compare_products`, returning shared specification rows and a checklist of
   satisfied and missed requirements with the catalogue field behind each one.
4. Checks the budget and the purchasing policy, then builds the cart with `add_to_cart`.
5. Snapshots the cart into an approval sheet with `prepare_checkout`. Prices are frozen server-side.
6. Waits. The buyer reviews the sheet, ticks approval and continues to PayPal.
7. The server creates the PayPal Orders v2 order, the buyer approves in sandbox, the server captures it, verifies the
   amount and marks the order paid.

Every step is visible in a live run ledger and stored in an activity log with tool inputs, outputs and durations.

## How it is built

React + Vite + TypeScript + Tailwind on the front, Express + TypeScript on the back, Zod at every boundary, SQLite
locally and Postgres/Supabase in deployment, Gemini or OpenAI function calling with a deterministic local planner as a
labelled fallback, and PayPal Orders v2 (create, capture, webhook signature verification) for payment.

The agent has exactly ten tools, none of which can move money. Policy enforcement, totals and payment verification all
happen on the server, outside the model's reach.

## What is innovative

- **A real capability boundary.** The agent can search, compare, decide and write a cart. It cannot pay, change policy
  or read credentials. The approval sheet is a product feature, not a modal.
- **Explainable by construction.** Recommendations are generated from `compare_products` output: each satisfied or
  missed requirement carries the catalogue text it was read from. The model never supplies a specification or a price.
- **Transparent execution.** The run ledger streams actual tool calls as they happen; the activity page keeps inputs,
  outputs, errors and timings for every call.
- **Budget intelligence.** When a cart breaks the budget the agent proposes a cheaper catalogue record instead of
  silently proceeding.
- **Honest failure states.** No model key, no PayPal key, provider outage and payment cancellation each produce a
  specific, truthful interface state. Nothing is faked as a successful payment.

## Challenges

Keeping the model away from facts. It is easy to let an LLM write a product description; it is harder to force every
number through a tool result. The tool outputs are the only source of prices and specs, and the prompt says so
explicitly. The second challenge was money: the authoritative total must come from the server cart, be frozen in the
order, and be re-verified against the PayPal capture before anything is marked paid.

## What we learned

Agent UX is a ledger, not a chat. People trust an agent that shows the call it made and the result it got. A local
deterministic planner over the same tools is also a useful honesty test: if the tool surface is well designed, the
planner can complete the workflow, which means the model is adding judgement rather than holding the app together.

## What's next

Live merchant feeds instead of sample records, pgvector product retrieval, per-user spend analytics, team policies,
additional PayPal flows (vaulting, subscriptions) and shipping-address handling.

## Built with

TypeScript, React, Vite, Tailwind CSS, TanStack Query, Framer Motion, Lucide, Express, Zod, Node.js, SQLite/Postgres,
Gemini / OpenAI tool calling, PayPal Orders v2 and webhooks.

## Try it

`npm install && npm run db:reset && npm run dev`, then sign in with `demo@agentcart.dev` / `demo12345`. Add sandbox keys
to enable real PayPal capture.
