import { money } from '../../lib/util.js';
import { defaultModel } from '../../env.js';
import { inferRequirements, parseBudgetCents } from '../requirements.js';
import type { AgentDeps, AgentHistoryMessage, AgentProvider, ToolRunResult } from '../types.js';

/**
 * Local planner. Used when no model key is configured, or when the model is
 * unreachable. It is a deterministic rule set over the same ten tools: real
 * catalogue reads, real cart writes, real policy checks. It never fabricates a
 * product fact, and the UI labels it as the local planner.
 */

function requirementPhrases(text: string, mustHave: string[]): string[] {
  const out: string[] = [];
  const ram = text.match(/(\d+)\s?gb\s?(?:of\s)?(?:ram|memory)/i);
  if (ram) out.push(`${ram[1]} GB RAM`);
  else if (mustHave.includes('ram')) out.push('16 GB RAM');
  if (mustHave.includes('gpu')) out.push('dedicated GPU');
  const storage = text.match(/(\d+)\s?(gb|tb)\s?(?:ssd|storage)/i);
  if (storage) out.push(`${storage[1]} ${storage[2].toUpperCase()} storage`);
  if (mustHave.includes('linux')) out.push('Linux support');
  if (mustHave.includes('portable')) out.push('portable under 2.2 kg');
  if (mustHave.includes('noise cancelling')) out.push('noise cancelling');
  return out;
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

function detectSelection(text: string): number | null {
  const numeric = text.match(/\b(?:option|choice|number|#|pick|choose|select|take)?\s*([1-9])\b/);
  const explicit = text.match(/\b(?:option|choice|number|#)\s*([1-9])\b/) ?? text.match(/\b(?:choose|select|pick|take)\s*(?:option\s*)?([1-9])\b/);
  if (explicit) return Number(explicit[1]);
  const ordinal = text.match(/\b(first|second|third|fourth|fifth)\b(?=\s*(?:one|option|choice|$|[,. ]))/);
  if (ordinal) return ORDINALS[ordinal[1]] ?? null;
  if (numeric && /\b(option|choice|number)\b/.test(text)) return Number(numeric[1]);
  return null;
}

const PRODUCT_NOUNS = [
  'wireless mouse',
  'mouse',
  'keyboard',
  'monitor',
  'webcam',
  'headphones',
  'earbuds',
  'laptop',
  'phone',
  'ssd',
  'charger',
  'hub',
  'stand',
  'raspberry pi',
  'camera',
  'power bank',
];

function extraQueries(text: string): string[] {
  const clauses = text.split(/\band\b|\bplus\b|\balso\b|\bwith\b|,|\+|;/i).map((clause) => clause.trim());
  const queries: string[] = [];
  for (const clause of clauses) {
    if (!/\b(add|get|include|throw in|buy|grab|pick up)\b/i.test(clause)) continue;
    const noun = PRODUCT_NOUNS.find((word) => clause.toLowerCase().includes(word));
    if (!noun) continue;
    const cleaned = clause
      .replace(/\b(add|get|include|throw in|buy|grab|pick up|to (the|my) cart|please)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    queries.push(cleaned.length > 3 ? cleaned : noun);
  }
  return [...new Set(queries)];
}

function productLine(index: number, product: any, check?: any): string {
  const specs = product.specs ?? {};
  const keySpecs = [specs.ram, specs.gpu, specs.storage, specs.display].
    filter(Boolean).
    slice(0, 3).
    join(' · ');
  const lines = [`${index + 1}. ${product.brand} ${product.name} — ${money(product.priceCents)}`];
  if (keySpecs) lines.push(`   ${keySpecs}`);
  if (check) {
    const met = check.checks.filter((entry: any) => entry.satisfied);
    const missed = check.checks.filter((entry: any) => !entry.satisfied);
    if (met.length) lines.push(`   Fits: ${met.map((entry: any) => entry.requirement).join(', ')}`);
    if (missed.length) lines.push(`   Misses: ${missed.map((entry: any) => entry.requirement).join(', ')}`);
  }
  return lines.join('\n');
}

function cartHeadline(cart: any): string {
  const count = cart.items.length;
  return `${count} ${count === 1 ? 'line' : 'lines'} · ${money(cart.totals.totalCents)}`;
}

export class HeuristicProvider implements AgentProvider {
  name = 'heuristic' as const;
  model = defaultModel('heuristic');

  async run(deps: AgentDeps, userText: string, _history: AgentHistoryMessage[]): Promise<{ reply: string }> {
    const text = userText.trim();
    const lower = text.toLowerCase();

    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b[.!]?$/.test(lower)) {
      return {
        reply:
          'Tell me what you need and a budget, for example "a laptop for robotics with 16 GB RAM and a GPU under $1,000". I search the catalogue, compare the matches, build a cart within your policy and prepare a PayPal approval you control.',
      };
    }

    if (/^(thanks|thank you|great|nice)\b/.test(lower) && text.length < 30) {
      return { reply: 'Any time. Say "show my cart" when you want the totals again.' };
    }

    const selection = detectSelection(lower);
    if (selection !== null && deps.state.lastSearch?.ids?.length) {
      const ids = deps.state.lastSearch.ids;
      const productId = ids[selection - 1];
      if (!productId) {
        return { reply: `My last search returned ${ids.length} options, so there is no option ${selection}. Ask me to search again and I will list them.` };
      }
      const details = await deps.executeTool('get_product_details', { productId });
      if (!details.ok) return { reply: `I could not read that catalogue record: ${details.error}` };
      const product = details.output;
      const added = await deps.executeTool('add_to_cart', { productId, quantity: 1 });
      const lines = added.ok
        ? [`Added the ${product.brand} ${product.name} at ${money(product.priceCents)}.`]
        : [`I could not add the ${product.brand} ${product.name}: ${added.error}`];

      for (const query of extraQueries(lower)) {
        const search = await deps.executeTool('search_products', { query, inStockOnly: true, limit: 3 });
        const match = search.ok ? search.output.products?.[0] : null;
        if (!match) {
          lines.push(`I found no catalogue match for "${query}".`);
          continue;
        }
        const extra = await deps.executeTool('add_to_cart', { productId: match.id, quantity: 1 });
        lines.push(
          extra.ok
            ? `Added the ${match.brand} ${match.name} at ${money(match.priceCents)} for "${query}".`
            : `Could not add ${match.brand} ${match.name}: ${extra.error}`,
        );
      }

      const cart = await deps.executeTool('calculate_cart', {});
      if (cart.ok) {
        lines.push(`${cartHeadline(cart.output)}.`);
        const remaining = cart.output.budgetRemainingCents;
        lines.push(
          remaining >= 0
            ? `${money(remaining)} left inside your ${money(cart.output.policy.maxBudgetCents)} budget.`
            : `${money(-remaining)} over your ${money(cart.output.policy.maxBudgetCents)} budget. Remove an item or raise the budget in Settings.`,
        );
      }

      if (/\b(checkout|check out|proceed|approve|place (the )?order|ready to pay|pay now)\b/.test(lower)) {
        lines.push(await this.prepareApproval(deps));
      } else {
        lines.push('Say "proceed to checkout" when you want the approval sheet.');
      }
      return { reply: lines.join('\n') };
    }

    if (/\b(remove|delete|drop|take out)\b/.test(lower)) {
      const cart = await deps.executeTool('get_cart', {});
      if (!cart.ok) return { reply: `I could not read the cart: ${cart.error}` };
      const items = cart.output.items as any[];
      if (items.length === 0) return { reply: 'The cart is empty, so there is nothing to remove.' };
      const tokens = lower.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
      const item =
        items.find((entry) => tokens.some((token) => entry.name.toLowerCase().includes(token))) ??
        items.find((entry) => tokens.some((token) => entry.brand.toLowerCase().includes(token)));
      if (!item) {
        return { reply: `I could not tell which line to remove. The cart holds: ${items.map((entry) => `${entry.brand} ${entry.name}`).join(', ')}.` };
      }
      const removed = await deps.executeTool('remove_from_cart', { productId: item.productId });
      if (!removed.ok) return { reply: `I could not remove that item: ${removed.error}` };
      return {
        reply: `Removed the ${item.brand} ${item.name}. ${cartHeadline(removed.output.cart)}. Say "proceed to checkout" when the cart is right.`,
      };
    }

    if (/\b(show|what('| i)?s|view|see|open)\b.*\bcart\b|\bcart\b.*\b(total|summary)\b|^cart$/.test(lower)) {
      const cart = await deps.executeTool('calculate_cart', {});
      if (!cart.ok) return { reply: `I could not read the cart: ${cart.error}` };
      if (cart.output.items.length === 0) return { reply: 'Your cart is empty. Tell me what you need and I will build it.' };
      const lines = cart.output.items.map(
        (item: any) => `${item.quantity} × ${item.brand} ${item.name} — ${money(item.lineTotalCents)}`,
      );
      lines.push(`Total ${money(cart.output.totals.totalCents)}.`);
      if (cart.output.violations.length) {
        lines.push(`Policy: ${cart.output.violations.map((violation: any) => violation.message).join('; ')}.`);
      }
      lines.push('Say "proceed to checkout" to prepare the approval sheet.');
      return { reply: lines.join('\n') };
    }

    if (/\b(checkout|check out|proceed|place (the )?order|ready to (pay|buy)|pay now)\b/.test(lower)) {
      return { reply: await this.prepareApproval(deps) };
    }

    if (/\bcompare|difference between|\bvs\b\b/.test(lower)) {
      let ids = deps.state.lastSearch?.ids?.slice(0, 3) ?? [];
      if (ids.length < 2) {
        const budget = parseBudgetCents(lower);
        const search = await deps.executeTool('search_products', {
          query: text,
          maxPriceCents: budget ?? undefined,
          inStockOnly: true,
          limit: 3,
        });
        ids = search.ok ? (search.output.products as any[]).map((product) => product.id) : [];
      }
      if (ids.length < 2) {
        return { reply: 'I need at least two products to compare. Search first, or name two items and I will look them up.' };
      }
      const comparison = await deps.executeTool('compare_products', {
        productIds: ids.slice(0, 4),
        requirements: deps.state.requirements ?? [],
      });
      if (!comparison.ok) return { reply: `The comparison failed: ${comparison.error}` };
      const lines = (comparison.output.products as any[]).map((product, index) => productLine(index, product, product.requirementChecks));
      lines.push(
        `Cheapest is the ${(comparison.output.products as any[]).find((product) => product.id === comparison.output.cheapestId)?.name}. The spread across these options is ${money(comparison.output.priceSpreadCents)}.`,
      );
      lines.push('Say "choose 2" to add one to the cart.');
      return { reply: lines.join('\n') };
    }

    if (/\b(budget|afford|how much)\b/.test(lower) && !/\b(laptop|mouse|phone|headphone|monitor|keyboard|ssd|charger|camera|coupon)\b/.test(lower)) {
      const budget = await deps.executeTool('check_budget', {});
      if (!budget.ok) return { reply: `I could not check the budget: ${budget.error}` };
      const output = budget.output;
      return {
        reply: output.withinBudget
          ? `Your budget is ${money(output.budgetCents)}. ${money(output.amountCents)} is committed, ${money(output.remainingCents)} remains.`
          : `Your budget is ${money(output.budgetCents)} and the current amount is ${money(output.amountCents)}, which is ${money(output.overByCents)} over. Remove an item or raise the budget in Settings.`,
      };
    }

    return this.searchAndRecommend(deps, text, lower);
  }

  private async prepareApproval(deps: AgentDeps): Promise<string> {
    const prepared = await deps.executeTool('prepare_checkout', {});
    if (!prepared.ok) {
      const violations = (prepared.output?.violations ?? []) as any[];
      if (violations.length === 0) return `I could not prepare the approval: ${prepared.error}`;
      const lines = ['I cannot prepare this checkout yet:'];
      for (const violation of violations) lines.push(`- ${violation.message}`);

      if (violations.some((violation) => violation.code === 'budget_exceeded')) {
        const cart = await deps.executeTool('get_cart', {});
        const items = (cart.ok ? cart.output.items : []) as any[];
        const priciest = [...items].sort((a, b) => b.lineTotalCents - a.lineTotalCents)[0];
        if (priciest) {
          const alternative = await deps.executeTool('search_products', {
            query: priciest.name,
            category: priciest.category,
            inStockOnly: true,
            limit: 3,
          });
          const cheaper = (alternative.ok ? alternative.output.products : []).filter(
            (product: any) => product.priceCents < priciest.lineTotalCents && !items.some((item) => item.productId === product.id),
          );
          if (cheaper?.[0]) {
            lines.push(
              `A cheaper alternative is the ${cheaper[0].brand} ${cheaper[0].name} at ${money(cheaper[0].priceCents)}. Say "swap the ${priciest.name} for the ${cheaper[0].name}" and I will rebuild the cart.`,
            );
          }
        }
      }
      return lines.join('\n');
    }
    const order = prepared.output.order;
    return [
      `Your cart is ready: ${order.items.length} ${order.items.length === 1 ? 'line' : 'lines'}, ${money(order.totalCents)} total.`,
      `The approval sheet is at ${prepared.output.approvePath}. Nothing is charged until you approve it and pay in PayPal.`,
    ].join('\n');
  }

  private async searchAndRecommend(deps: AgentDeps, text: string, lower: string): Promise<{ reply: string }> {
    const inferred = inferRequirements(text);
    const requirements = requirementPhrases(text, inferred.mustHave);
    deps.state.requirements = requirements;
    deps.state.budgetCents = inferred.budgetCents;

    const search = await deps.executeTool('search_products', {
      query: text,
      category: inferred.category ?? undefined,
      maxPriceCents: inferred.budgetCents ?? undefined,
      inStockOnly: true,
      limit: 6,
    });
    if (!search.ok) return { reply: `The catalogue search failed: ${search.error}` };

    let products = (search.output.products ?? []) as any[];

    if (products.length === 0 && inferred.budgetCents) {
      const wider = await deps.executeTool('search_products', {
        query: text,
        category: inferred.category ?? undefined,
        inStockOnly: true,
        limit: 4,
      });
      const widerProducts = (wider.ok ? wider.output.products : []) as any[];
      if (widerProducts.length > 0) {
        const cheapest = [...widerProducts].sort((a, b) => a.priceCents - b.priceCents)[0];
        const over = cheapest.priceCents - inferred.budgetCents;
        deps.state.lastSearch = { query: text, ids: widerProducts.map((product) => product.id), at: new Date().toISOString() };
        return {
          reply: [
            `Nothing in the catalogue meets ${money(inferred.budgetCents)} with that brief.`,
            `The closest match is the ${cheapest.brand} ${cheapest.name} at ${money(cheapest.priceCents)}, ${money(over)} over budget.`,
            'I can compare it with the next cheapest option, or you can raise the budget in Settings.',
          ].join('\n'),
        };
      }
    }

    if (products.length === 0) {
      return {
        reply: [
          'No catalogue record matched that description.',
          'I hold laptops, phones, headphones, peripherals, accessories and electronics boards. Try naming the category and the one spec that matters, for example "14-inch laptop with 16 GB RAM under $900".',
        ].join('\n'),
      };
    }

    const shortlist = products.slice(0, 3);
    deps.state.lastSearch = {
      query: text,
      ids: products.map((product) => product.id),
      at: new Date().toISOString(),
    };

    const comparison = await deps.executeTool('compare_products', {
      productIds: shortlist.map((product) => product.id),
      requirements,
    });
    const checks = new Map<string, any>();
    if (comparison.ok) {
      for (const product of comparison.output.products as any[]) {
        checks.set(product.id, product.requirementChecks);
      }
    }

    const lines = [
      `I found ${products.length} catalogue ${products.length === 1 ? 'record' : 'records'}${inferred.budgetCents ? ` under ${money(inferred.budgetCents)}` : ''}. ${shortlist.length > 1 ? 'The three closest:' : 'The closest match:'}`,
      '',
      ...shortlist.map((product, index) => productLine(index, product, checks.get(product.id))),
    ];

    if (requirements.length) {
      lines.push('', `Checked against: ${requirements.join(', ')}.`);
    }

    const best = shortlist[0];
    if (inferred.budgetCents) {
      lines.push(
        `${best.brand} ${best.name} leaves ${money(inferred.budgetCents - best.priceCents)} of your ${money(inferred.budgetCents)} budget.`,
      );
    }

    if (/\b(buy|add|select|choose|get me|order)\b/.test(lower)) {
      const added = await deps.executeTool('add_to_cart', { productId: best.id, quantity: 1 });
      if (added.ok) {
        lines.push('', `Added the ${best.brand} ${best.name}. ${cartHeadline(added.output.cart)}.`);
      }
    }

    lines.push('', shortlist.length > 1 ? 'Say "choose 2" to add an option, or ask me to compare them.' : 'Say "add it" and I will put it in the cart.');
    return { reply: lines.join('\n') };
  }
}
