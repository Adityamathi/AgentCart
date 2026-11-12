# Three-minute demo script

Setup before recording: `npm install && npm run db:reset && npm run dev`; sign in with `demo@agentcart.dev` /
`demo12345`; leave the workspace open; PayPal keys and a model key configured if available. If PayPal keys are absent,
say so and show the configuration-required state rather than skipping it.

## 0:00 — The problem (20 s)

> Shopping online still means doing the agent's job: searching, opening tabs, comparing specification tables, checking
> the budget, building a cart. AgentCart is a purchasing agent, not a recommender. It does the work and hands you the
> decision that matters.

Show the landing hero: the run ledger and the approval sheet preview.

## 0:20 — The brief (20 s)

In the workspace, type:

> I need a laptop for robotics with Python, ROS and computer vision. Budget $1,000, prefer 16 GB RAM and a dedicated GPU.

While it runs, point at the live ledger: **Searching the catalogue**, **Comparing specifications**, each with its
result and duration.

## 0:40 — The recommendation (30 s)

The agent lists three laptops with real prices, key specs, and **Fits / Misses** lines. Point out:

> These aren't model guesses. This is the catalogue record. Each requirement line names the field it was read from.

Open the run ledger disclosure to show `search_products` and `compare_products` inputs and outputs.

## 1:10 — The cart (20 s)

Type:

> choose 1 and add a wireless mouse

The agent reads the selected record, adds it, searches for the mouse, adds it, then recalculates the cart and reports
the budget remaining. Open **Cart** to show the server-computed lines and the policy bar.

## 1:30 — Budget intelligence (25 s)

In **Settings**, drop the budget to $500 and save. Return to the cart: it is now over budget, checkout is blocked, and
the agent offers a cheaper catalogue alternative instead of proceeding. Restore the budget to $1,000.

## 1:55 — The approval gate (30 s)

Ask the agent to proceed to checkout. It creates an approval sheet and says nothing is charged. On the sheet:

> This is the stop between the agent and the money. The prices are frozen here, and the PayPal order doesn't exist yet.

Tick the approval box. Point out that the agent had no tool that could do this.

## 2:25 — PayPal (25 s)

Continue to PayPal. If sandbox keys are configured, sign in with a sandbox buyer, approve, and land on the receipt:
capture id, payer email, paid timestamp, and the order total that was verified against the capture. If keys are not
configured, show the exact missing variables and state plainly that no payment was simulated.

## 2:50 — Close (10 s)

Open **Agent activity** and show the ledger: every call, input, output and duration.

> Your intent, our intelligence, your approval. The agent does the shopping. You keep the money.

## Contingencies

- **No model key:** the local planner handles the same run; the sidebar badge says "local planner". Say that it is the
  deterministic fallback over the identical tools.
- **Provider outage mid-run:** the turn stops with a message; no duplicate cart writes. Retry once.
- **Out of stock:** search for the ROG Zephyrus G14 and show the refusal instead of a fake add.
- **Webhook:** mention that captures are also reconciled by signature-verified webhooks with idempotent event ids.
