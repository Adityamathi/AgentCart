import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { money, statusLabel } from '../lib/format';
import { Button, ButtonLink, Notice, PageHeader, Panel, Spinner, StatusDot } from '../components/ui';

declare global {
  interface Window {
    paypal?: any;
  }
}

export default function Checkout() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sdkState, setSdkState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const buttonsRef = useRef<any>(null);
  const startedRef = useRef(false);

  const orderQuery = useQuery({ queryKey: ['order', orderId], queryFn: () => api.order(orderId), enabled: Boolean(orderId) });
  const configQuery = useQuery({ queryKey: ['paypal-config'], queryFn: api.paypalConfig, staleTime: 60_000 });

  const order = orderQuery.data?.order;
  const config = configQuery.data;
  const payable = order ? order.status === 'awaiting_approval' || order.status === 'paypal_created' : false;

  // Ask the server to open the PayPal order for this approved AgentCart order.
  useEffect(() => {
    if (!order || !config?.configured || !payable || startedRef.current) return;
    startedRef.current = true;
    api
      .paypalCreate(order.id)
      .then((result) => {
        setPaypalOrderId(result.paypalOrderId);
        setApproveUrl(result.approveUrl);
      })
      .catch((createError: Error) => setError(createError.message));
  }, [order, config?.configured, payable]);

  useEffect(() => {
    if (!config?.configured || !payable || !paypalOrderId) return;
    let cancelled = false;

    const renderButtons = () => {
      if (cancelled || buttonsRef.current || !window.paypal) return;
      const buttons = window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', color: 'blue', label: 'paypal', height: 44, tagline: false },
        createOrder: async () => {
          setError(null);
          const created = await api.paypalCreate(orderId);
          setPaypalOrderId(created.paypalOrderId);
          if (created.approveUrl) setApproveUrl(created.approveUrl);
          return created.paypalOrderId;
        },
        onApprove: async () => {
          setCapturing(true);
          setError(null);
          try {
            const captured = await api.paypalCapture(orderId);
            queryClient.setQueryData(['order', orderId], { order: captured.order });
            await queryClient.invalidateQueries({ queryKey: ['orders'] });
            await queryClient.invalidateQueries({ queryKey: ['cart'] });
            navigate(`/orders/${orderId}?paid=1`, { replace: true });
          } catch (captureError) {
            setError((captureError as Error).message);
          } finally {
            setCapturing(false);
          }
        },
        onCancel: () => {
          setMessage('Payment cancelled in PayPal. Nothing was charged and the order is still open.');
        },
        onError: (paypalError: unknown) => {
          setError(
            `PayPal reported an error: ${paypalError instanceof Error ? paypalError.message : 'unknown error'}. Nothing was charged.`,
          );
        },
      });
      buttonsRef.current = buttons;
      buttons.render('#paypal-buttons').catch(() => setSdkState('failed'));
      setSdkState('ready');
    };

    if (window.paypal) {
      renderButtons();
      return () => undefined;
    }

    setSdkState('loading');
    const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk="true"]');
    if (existing) {
      existing.addEventListener('load', renderButtons);
      return () => existing.removeEventListener('load', renderButtons);
    }

    const script = document.createElement('script');
    script.src = config.sdkUrl;
    script.async = true;
    script.dataset.paypalSdk = 'true';
    script.onload = renderButtons;
    script.onerror = () => setSdkState('failed');
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [config?.configured, config?.sdkUrl, payable, paypalOrderId, orderId, queryClient, navigate]);

  useEffect(
    () => () => {
      try {
        buttonsRef.current?.close?.();
      } catch {
        /* nothing to close */
      }
    },
    [],
  );

  async function captureNow() {
    setCapturing(true);
    setError(null);
    try {
      const captured = await api.paypalCapture(orderId);
      queryClient.setQueryData(['order', orderId], { order: captured.order });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/orders/${orderId}?paid=1`, { replace: true });
    } catch (captureError) {
      setError((captureError as Error).message);
    } finally {
      setCapturing(false);
    }
  }

  if (orderQuery.isLoading || configQuery.isLoading) return <Spinner label="Opening PayPal checkout" />;
  if (orderQuery.error || !order) {
    return (
      <div>
        <PageHeader eyebrow="Checkout" title="PayPal checkout" />
        <Notice tone="bad" title="Order not found">
          That order does not exist on this account. <Link to="/orders" className="underline">Back to orders</Link>.
        </Notice>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/approval/${order.id}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={1.5} /> Approval sheet
      </Link>

      <PageHeader
        eyebrow="Checkout"
        title="PayPal payment"
        detail="The amount below was written to the order record before this page opened. PayPal charges that figure, not anything the browser sends."
        action={<StatusDot tone={order.status === 'paid' ? 'ok' : 'warn'} label={statusLabel(order.status)} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {order.status === 'paid' ? (
            <Panel className="p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck size={18} strokeWidth={1.6} className="mt-0.5 text-positive" />
                <div>
                  <p className="text-[14px] font-medium text-ink">This order is already paid</p>
                  <p className="mt-1 text-[13px] leading-6 text-ink-2">
                    Capture {order.paypalCaptureId ?? 'recorded'} was verified with PayPal. Open the receipt for the
                    payment record.
                  </p>
                  <ButtonLink to={`/orders/${order.id}`} size="sm" className="mt-3">
                    View receipt
                  </ButtonLink>
                </div>
              </div>
            </Panel>
          ) : !config?.configured ? (
            <Panel className="p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} strokeWidth={1.6} className="mt-0.5 text-warn" />
                <div>
                  <p className="text-[14px] font-medium text-ink">PayPal keys are not configured</p>
                  <p className="mt-1 max-w-[60ch] text-[13px] leading-6 text-ink-2">
                    The order is prepared and waiting at the approval gate, but no payment can be taken. Add sandbox
                    credentials to the server environment and restart it. Nothing is simulated or marked paid here.
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-md border border-line bg-paper px-3 py-2 font-mono text-[11px] leading-5 text-ink-2">
{`PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=...   # optional, enables signature-checked webhooks`}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href="https://developer.paypal.com/dashboard/applications/sandbox"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
                    >
                      PayPal developer dashboard <ExternalLink size={12} strokeWidth={1.5} />
                    </a>
                    <ButtonLink to="/orders" variant="secondary" size="sm">
                      See orders
                    </ButtonLink>
                  </div>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Pay with PayPal</h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  {config.environment} · {config.currency}
                </span>
              </div>
              <div className="p-4">
                <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
                  <span className="text-[13px] text-ink-2">Order total</span>
                  <span className="text-[22px] tabular-nums text-ink">{money(order.totalCents, order.currency)}</span>
                </div>

                <div id="paypal-buttons" className="min-h-[52px]" />

                {sdkState === 'loading' && !paypalOrderId ? <p className="text-[12.5px] text-ink-3">Loading the PayPal SDK</p> : null}
                {sdkState === 'failed' ? (
                  <Notice tone="warn" title="PayPal buttons could not load">
                    The SDK script was blocked or unreachable. Use the approval link below, then capture the payment.
                  </Notice>
                ) : null}

                {approveUrl ? (
                  <a
                    href={approveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
                  >
                    Open the PayPal approval page <ExternalLink size={12} strokeWidth={1.5} />
                  </a>
                ) : null}

                {paypalOrderId ? (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                      PayPal order {paypalOrderId}
                    </p>
                    <Button variant="secondary" size="sm" className="mt-2" loading={capturing} onClick={() => void captureNow()}>
                      I approved it in PayPal, capture now
                    </Button>
                    <p className="mt-1.5 text-[11.5px] leading-4 text-ink-3">
                      Use this after approving in a separate window. The server verifies the capture with PayPal before
                      it marks the order paid.
                    </p>
                  </div>
                ) : null}

                {message ? (
                  <div className="mt-4">
                    <Notice tone="warn">{message}</Notice>
                  </div>
                ) : null}
                {error ? (
                  <div className="mt-4">
                    <Notice tone="bad" title="Payment not completed">
                      {error}
                    </Notice>
                  </div>
                ) : null}

                <div className="mt-5 flex items-start gap-2 border-t border-line pt-3">
                  <Lock size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" />
                  <p className="text-[11.5px] leading-5 text-ink-3">
                    Sandbox only. Use a PayPal sandbox buyer account. The client secret never reaches this page; the
                    server creates and captures the order.
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </div>

        <Panel className="h-fit overflow-hidden">
          <div className="border-b border-line px-4 py-2.5">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Order</h2>
          </div>
          <ul>
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] text-ink">{item.name}</p>
                  <p className="font-mono text-[10.5px] text-ink-3">
                    {item.brand} · {item.quantity} × {money(item.unitPriceCents)}
                  </p>
                </div>
                <span className="shrink-0 text-[12.5px] tabular-nums text-ink">{money(item.lineTotalCents)}</span>
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
              <dt className="text-[12.5px] text-ink-2">Total</dt>
              <dd className="text-[16px] tabular-nums text-ink">{money(order.totalCents, order.currency)}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
