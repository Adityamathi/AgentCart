import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { ProductFigure } from '../components/ProductFigure';
import { Button, ButtonLink, EmptyState, Notice, PageHeader, Panel, Spinner, StatusDot, cx } from '../components/ui';

export default function CartPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['cart'], queryFn: api.cart });
  const cart = data?.cart;

  const setQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) => api.setQuantity(itemId, quantity),
    onSuccess: (result) => queryClient.setQueryData(['cart'], result),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.removeItem(itemId),
    onSuccess: (result) => queryClient.setQueryData(['cart'], result),
  });

  const clearCart = useMutation({
    mutationFn: () => api.clearCart(),
    onSuccess: (result) => queryClient.setQueryData(['cart'], result),
  });

  const createOrder = useMutation({
    mutationFn: () => api.createOrder(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/approval/${result.order.id}`);
    },
  });

  if (isLoading) return <Spinner label="Reading the cart" />;

  if (!cart || cart.items.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Cart" title="Your cart" detail="Prices are read from the catalogue each time this page loads." />
        <EmptyState
          icon={<ShoppingBag size={20} strokeWidth={1.5} />}
          title="The cart is empty"
          detail="Ask the agent for a product, or add records directly from the catalogue."
          action={
            <div className="flex gap-2">
              <ButtonLink to="/app" size="sm">
                Ask the agent
              </ButtonLink>
              <ButtonLink to="/catalog" variant="secondary" size="sm">
                Catalogue
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  const busy = setQuantity.isPending || removeItem.isPending;
  const budgetRatio = Math.min(100, Math.round((cart.totals.totalCents / Math.max(cart.policy.maxBudgetCents, 1)) * 100));

  return (
    <div>
      <PageHeader
        eyebrow="Cart"
        title="Your cart"
        detail="The server recalculates every line. Nothing here can be changed by the agent without a tool call you can inspect."
        action={
          <Button variant="ghost" size="sm" onClick={() => clearCart.mutate()} loading={clearCart.isPending}>
            Clear cart
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="self-start overflow-hidden">
          <div className="hidden grid-cols-[1fr_104px_112px_32px] items-center gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 sm:grid">
            <span>Item</span>
            <span className="text-center">Quantity</span>
            <span className="text-right">Line total</span>
            <span />
          </div>
          <ul>
            {cart.items.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1fr_104px_112px_32px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-12 w-14 shrink-0">
                    <ProductFigure
                      product={{ category: item.category, name: item.name, brand: item.brand }}
                      className="h-full w-full"
                      detail={false}
                    />
                  </div>
                  <div className="min-w-0">
                    <Link to={`/catalog/${item.productId}`} className="block truncate text-[13.5px] text-ink hover:underline">
                      {item.brand} {item.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                      {money(item.unitPriceCents)} each
                      {!item.available ? <span className="ml-2 text-negative">Only {item.stock} left</span> : null}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="flex h-8 items-center rounded-md border border-line">
                    <button
                      type="button"
                      className="flex h-8 w-7 items-center justify-center text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
                      onClick={() => setQuantity.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                      disabled={busy}
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      <Minus size={12} strokeWidth={1.8} />
                    </button>
                    <span className="w-6 text-center font-mono text-[12px] tabular-nums text-ink">{item.quantity}</span>
                    <button
                      type="button"
                      className="flex h-8 w-7 items-center justify-center text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
                      onClick={() => setQuantity.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                      disabled={busy || item.quantity >= item.stock}
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      <Plus size={12} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>

                <p className="hidden text-right text-[13px] tabular-nums text-ink sm:block">{money(item.lineTotalCents)}</p>

                <button
                  type="button"
                  onClick={() => removeItem.mutate(item.id)}
                  disabled={busy}
                  className="justify-self-end text-ink-3 transition-colors hover:text-negative disabled:opacity-40"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <div className="border-b border-line px-4 py-2.5">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Order summary</h2>
            </div>
            <dl className="px-4 py-3">
              <div className="flex justify-between border-b border-line py-2 text-[13px]">
                <dt className="text-ink-2">Subtotal</dt>
                <dd className="tabular-nums text-ink">{money(cart.totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between border-b border-line py-2 text-[13px]">
                <dt className="text-ink-2">Shipping</dt>
                <dd className="tabular-nums text-ink">{money(cart.totals.shippingCents)}</dd>
              </div>
              <div className="flex justify-between border-b border-line py-2 text-[13px]">
                <dt className="text-ink-2">Tax</dt>
                <dd className="tabular-nums text-ink">{money(cart.totals.taxCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between pt-3">
                <dt className="text-[13px] text-ink-2">Total, in {cart.totals.currency}</dt>
                <dd className="text-[20px] tabular-nums text-ink">{money(cart.totals.totalCents, cart.totals.currency)}</dd>
              </div>
            </dl>

            <div className="border-t border-line px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                <span>Policy budget</span>
                <span className="tabular-nums">
                  {money(cart.totals.totalCents)} / {money(cart.policy.maxBudgetCents)}
                </span>
              </div>
              <div className="h-1 w-full bg-raised">
                <div className={cx('h-1', budgetRatio >= 100 ? 'bg-negative' : 'bg-positive')} style={{ width: `${budgetRatio}%` }} />
              </div>
              <p className="mt-1.5 text-[11.5px] text-ink-3">
                {cart.budgetRemainingCents >= 0
                  ? `${money(cart.budgetRemainingCents)} remains inside your limit`
                  : `${money(-cart.budgetRemainingCents)} over your limit`}
              </p>
            </div>

            <div className="border-t border-line px-4 py-3">
              {cart.violations.length > 0 ? (
                <div className="mb-3 flex flex-col gap-2">
                  {cart.violations.map((violation) => (
                    <Notice key={violation.code + violation.message} tone="bad">
                      {violation.message}
                    </Notice>
                  ))}
                </div>
              ) : (
                <div className="mb-3 flex items-center gap-2">
                  <StatusDot tone="ok" label="Inside policy, ready for approval" />
                </div>
              )}
              <Button
                className="w-full"
                disabled={!cart.canCheckout}
                loading={createOrder.isPending}
                onClick={() => createOrder.mutate()}
              >
                <ShieldCheck size={15} strokeWidth={1.6} /> Continue to approval
                <ArrowRight size={15} strokeWidth={1.6} />
              </Button>
              {createOrder.isError ? (
                <p className="mt-2 text-[11.5px] leading-4 text-negative">{(createOrder.error as Error).message}</p>
              ) : null}
              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                Approval is required before PayPal
              </p>
            </div>
          </Panel>

          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['cart'] })}
            className="inline-flex items-center justify-center gap-1.5 text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            <Check size={12} strokeWidth={1.5} /> Prices rechecked on every load
          </button>
        </div>
      </div>
    </div>
  );
}
