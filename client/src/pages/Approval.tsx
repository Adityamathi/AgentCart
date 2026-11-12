import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, money, statusLabel } from '../lib/format';
import { ProductFigure } from '../components/ProductFigure';
import { Button, ButtonLink, Notice, PageHeader, Panel, Spinner, StatusDot } from '../components/ui';

export default function Approval() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [approved, setApproved] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.order(orderId),
    enabled: Boolean(orderId) && orderId !== 'latest',
  });

  if (!orderId || orderId === 'latest') {
    return (
      <div>
        <PageHeader eyebrow="Approval" title="Approval sheet" detail="An approval sheet is created from a validated cart." />
        <Panel className="p-6">
          <p className="text-[13.5px] text-ink-2">
            No approval is open. Build a cart first, then choose "Continue to approval".
          </p>
          <div className="mt-4 flex gap-2">
            <ButtonLink to="/cart" size="sm">
              Open cart
            </ButtonLink>
            <ButtonLink to="/app" variant="secondary" size="sm">
              Ask the agent
            </ButtonLink>
          </div>
        </Panel>
      </div>
    );
  }

  if (isLoading) return <Spinner label="Opening the approval sheet" />;
  if (error || !data) {
    return (
      <div>
        <PageHeader eyebrow="Approval" title="Approval sheet" />
        <Notice tone="bad" title="Approval not found">
          That order does not exist on this account. <Link to="/cart" className="underline">Back to the cart</Link>.
        </Notice>
      </div>
    );
  }

  const order = data.order;
  const payable = order.status === 'awaiting_approval' || order.status === 'paypal_created';

  return (
    <div>
      <Link to="/cart" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={1.5} /> Cart
      </Link>

      <PageHeader
        eyebrow="Approval"
        title="Review before payment"
        detail="This is the stop between the agent and your money. Nothing has been charged."
        action={
          <StatusDot
            tone={order.status === 'paid' ? 'ok' : order.status === 'failed' ? 'bad' : 'warn'}
            label={statusLabel(order.status)}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Order lines</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                Snapshot {dateTime(order.createdAt)}
              </span>
            </div>
            <ul>
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="h-12 w-14 shrink-0">
                    <ProductFigure
                      product={{ category: 'laptops', name: item.name, brand: item.brand }}
                      className="h-full w-full"
                      detail={false}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">
                      {item.brand} {item.name}
                    </p>
                    <p className="font-mono text-[10.5px] text-ink-3">
                      {item.quantity} × {money(item.unitPriceCents)}
                    </p>
                  </div>
                  <span className="text-[13px] tabular-nums text-ink">{money(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-4">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">What happens next</h2>
            <ol className="mt-3 flex flex-col gap-2.5">
              {[
                'You approve this sheet and continue to PayPal.',
                'The server creates a PayPal order for exactly this total.',
                'You sign in to PayPal sandbox and confirm the payment.',
                'The server captures the payment and verifies the amount.',
                'The order is marked paid and stock is decremented.',
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[10px] tabular-nums text-ink-3">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-[12.5px] leading-5 text-ink-2">{step}</span>
                </li>
              ))}
            </ol>
          </Panel>

          {order.failureReason ? (
            <Notice tone="bad" title="Last attempt failed">
              {order.failureReason}
            </Notice>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <div className="border-b border-line px-4 py-2.5">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Amount due</h2>
            </div>
            <dl className="px-4 py-3">
              <div className="flex justify-between border-b border-line py-2 text-[13px]">
                <dt className="text-ink-2">Subtotal</dt>
                <dd className="tabular-nums text-ink">{money(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between border-b border-line py-2 text-[13px]">
                <dt className="text-ink-2">Shipping</dt>
                <dd className="tabular-nums text-ink">{money(order.shippingCents)}</dd>
              </div>
              <div className="flex justify-between border-b border-line py-2 text-[13px]">
                <dt className="text-ink-2">Tax</dt>
                <dd className="tabular-nums text-ink">{money(order.taxCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between pt-3">
                <dt className="text-[13px] text-ink-2">Total, in {order.currency}</dt>
                <dd className="text-[22px] tabular-nums text-ink">{money(order.totalCents, order.currency)}</dd>
              </div>
            </dl>

            <div className="border-t border-line px-4 py-3">
              {payable ? (
                <>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2.5 transition-colors hover:bg-raised/50">
                    <input
                      type="checkbox"
                      checked={approved}
                      onChange={(event) => setApproved(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-accent"
                    />
                    <span className="text-[12.5px] leading-5 text-ink-2">
                      I approve this purchase of {money(order.totalCents, order.currency)} and understand the payment
                      is taken in PayPal.
                    </span>
                  </label>
                  <Button
                    className="mt-3 w-full"
                    variant="accent"
                    disabled={!approved}
                    onClick={() => {
                      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
                      navigate(`/checkout/${order.id}`);
                    }}
                  >
                    <Lock size={14} strokeWidth={1.6} /> Approve and continue to PayPal
                    <ArrowRight size={14} strokeWidth={1.6} />
                  </Button>
                </>
              ) : order.status === 'paid' ? (
                <ButtonLink to={`/orders/${order.id}`} className="w-full">
                  <ShieldCheck size={14} strokeWidth={1.6} /> View the receipt
                </ButtonLink>
              ) : (
                <ButtonLink to="/cart" variant="secondary" className="w-full">
                  Start a new cart
                </ButtonLink>
              )}
              <p className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                Approval recorded at {order.approvedAt ? dateTime(order.approvedAt) : 'the PayPal step'}
              </p>
            </div>
          </Panel>

          <div className="rounded-lg border border-dashed border-line-strong px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Why this exists</p>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-2">
              The agent can prepare an order, never pay one. Approval is a separate, explicit action on this account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
