import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, money, statusLabel } from '../lib/format';
import { Button, ButtonLink, Notice, PageHeader, Panel, Spinner, StatusDot } from '../components/ui';

export default function OrderDetail() {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['order', orderId], queryFn: () => api.order(orderId) });

  const cancel = useMutation({
    mutationFn: () => api.cancelOrder(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  if (isLoading) return <Spinner label="Reading the order" />;
  if (error || !data) {
    return (
      <div>
        <PageHeader eyebrow="Order" title="Order record" />
        <Notice tone="bad" title="Order not found">
          That order does not exist on this account. <Link to="/orders" className="underline">Back to orders</Link>.
        </Notice>
      </div>
    );
  }

  const order = data.order;
  const paid = order.status === 'paid';

  return (
    <div>
      <Link to="/orders" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={1.5} /> Orders
      </Link>

      <PageHeader
        eyebrow="Order"
        title={paid ? 'Payment confirmed' : 'Order record'}
        detail={
          paid
            ? 'Capture verified with PayPal. The values below come from the order and payment records on the server.'
            : 'This order has not been paid. Nothing was charged for it.'
        }
        action={<StatusDot tone={paid ? 'ok' : order.status === 'failed' ? 'bad' : 'warn'} label={statusLabel(order.status)} />}
      />

      {justPaid && paid ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-positive/25 bg-positive-wash px-4 py-3">
          <Check size={16} strokeWidth={2} className="mt-0.5 text-positive" />
          <div>
            <p className="text-[13px] font-medium text-positive">PayPal capture completed</p>
            <p className="mt-0.5 text-[12.5px] leading-5 text-positive/90">
              Payment {order.paypalCaptureId ?? ''} was verified before the order was marked paid.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Lines</h2>
            <span className="font-mono text-[10px] text-ink-3">{order.id}</span>
          </div>
          <ul>
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink">
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
          <dl className="border-t border-line px-4 py-3">
            <div className="flex justify-between py-1 text-[12.5px]">
              <dt className="text-ink-2">Subtotal</dt>
              <dd className="tabular-nums text-ink">{money(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between py-1 text-[12.5px]">
              <dt className="text-ink-2">Shipping</dt>
              <dd className="tabular-nums text-ink">{money(order.shippingCents)}</dd>
            </div>
            <div className="flex justify-between py-1 text-[12.5px]">
              <dt className="text-ink-2">Tax</dt>
              <dd className="tabular-nums text-ink">{money(order.taxCents)}</dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2.5">
              <dt className="text-[13px] text-ink-2">Total</dt>
              <dd className="text-[18px] tabular-nums text-ink">{money(order.totalCents, order.currency)}</dd>
            </div>
          </dl>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Record</h2>
            <dl className="mt-3 flex flex-col gap-2 text-[12.5px]">
              {[
                ['Status', statusLabel(order.status)],
                ['Created', dateTime(order.createdAt)],
                ['Approved', dateTime(order.approvedAt)],
                ['Paid', dateTime(order.paidAt)],
                ['Payer', order.payerEmail ?? '—'],
                ['Capture', order.paypalCaptureId ?? '—'],
                ['PayPal order', order.paypalOrderId ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
                  <dt className="shrink-0 text-ink-3">{label}</dt>
                  <dd className="break-all text-right font-mono text-[10.5px] leading-4 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {order.failureReason ? (
              <div className="mt-3">
                <Notice tone="bad">{order.failureReason}</Notice>
              </div>
            ) : null}
          </Panel>

          {paid ? (
            <ButtonLink to="/app" className="w-full">
              <ShieldCheck size={14} strokeWidth={1.6} /> Start another run
            </ButtonLink>
          ) : order.status === 'cancelled' ? (
            <ButtonLink to="/app" variant="secondary" className="w-full">
              Start a new run
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to={`/checkout/${order.id}`} className="w-full">
                Continue to PayPal
              </ButtonLink>
              <Button
                variant="secondary"
                className="w-full"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel this order
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
