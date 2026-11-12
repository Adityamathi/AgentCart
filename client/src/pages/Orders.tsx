import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, money, statusLabel } from '../lib/format';
import { ButtonLink, EmptyState, PageHeader, Panel, Spinner, StatusDot } from '../components/ui';

export default function Orders() {
  const { data, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.orders });
  const orders = data?.orders ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Orders"
        title="Purchase history"
        detail="Every order record, including approvals that were never paid. Payment status comes from the server, not from this page."
        action={
          <ButtonLink to="/app" size="sm">
            New run
          </ButtonLink>
        }
      />

      {isLoading ? (
        <Spinner label="Reading orders" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Receipt size={20} strokeWidth={1.5} />}
          title="No orders yet"
          detail="An order record appears when you prepare an approval from the cart."
          action={<ButtonLink to="/catalog" variant="secondary" size="sm">Browse the catalogue</ButtonLink>}
        />
      ) : (
        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_150px_120px_120px] gap-4 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 sm:grid">
            <span>Order</span>
            <span>Placed</span>
            <span>Status</span>
            <span className="text-right">Total</span>
          </div>
          <ul>
            {orders.map((order) => (
              <li key={order.id} className="border-b border-line last:border-0">
                <Link
                  to={`/orders/${order.id}`}
                  className="grid grid-cols-2 gap-3 px-4 py-3 transition-colors duration-150 ease-ease hover:bg-raised/50 sm:grid-cols-[1fr_150px_120px_120px] sm:items-center sm:gap-4"
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="truncate text-[13px] text-ink">
                      {order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">{order.id}</p>
                  </div>
                  <span className="font-mono text-[11px] text-ink-2">{dateTime(order.createdAt)}</span>
                  <StatusDot
                    tone={order.status === 'paid' ? 'ok' : order.status === 'failed' ? 'bad' : 'warn'}
                    label={statusLabel(order.status)}
                  />
                  <span className="text-right text-[13px] tabular-nums text-ink">{money(order.totalCents, order.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
