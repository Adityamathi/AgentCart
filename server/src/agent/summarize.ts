import { money } from '../lib/util.js';

/** One line a person can read, built only from what the tool actually returned. */
export function summarizeToolResult(name: string, output: any, ok: boolean, error?: string): string {
  if (!ok) return error ? error.slice(0, 160) : 'Tool failed';

  switch (name) {
    case 'search_products':
      return `${output?.count ?? 0} catalogue ${output?.count === 1 ? 'match' : 'matches'}`;
    case 'get_product_details':
      return `Read ${output?.brand ?? ''} ${output?.name ?? 'record'}`.trim();
    case 'compare_products':
      return `Compared ${output?.products?.length ?? 0} products across ${output?.dimensions?.length ?? 0} specifications`;
    case 'check_budget':
      return output?.withinBudget
        ? `${money(output.amountCents)} is within budget, ${money(output.remainingCents)} left`
        : `${money(output.overByCents)} over the ${money(output.budgetCents)} budget`;
    case 'check_product_compatibility':
      return `${output?.satisfied ?? 0} of ${output?.total ?? 0} requirements met`;
    case 'add_to_cart':
      return `Added ${output?.added?.name ?? 'item'} — cart ${money(output?.cart?.totals?.totalCents ?? 0)}`;
    case 'remove_from_cart':
      return `Removed item — cart ${money(output?.cart?.totals?.totalCents ?? 0)}`;
    case 'get_cart':
      return `${output?.items?.length ?? 0} lines, ${money(output?.totals?.totalCents ?? 0)}`;
    case 'calculate_cart': {
      const violations = output?.violations?.length ?? 0;
      return violations
        ? `${money(output?.totals?.totalCents ?? 0)} total, ${violations} policy ${violations === 1 ? 'issue' : 'issues'}`
        : `${money(output?.totals?.totalCents ?? 0)} total, policy clear`;
    }
    case 'prepare_checkout':
      return `Approval sheet ready for ${money(output?.order?.totalCents ?? 0)}, nothing charged`;
    default:
      return ok ? 'Completed' : 'Failed';
  }
}
