import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ChevronRight, Receipt, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, ApiError, streamAgentTurn } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { AgentTimeline, type TimelineStep } from '../components/AgentTimeline';
import { ProductFigure } from '../components/ProductFigure';
import { Button, EmptyState, Notice, PageHeader, Panel, StatusDot, cx } from '../components/ui';

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: TimelineStep[];
}

const EXAMPLES = [
  'I need a laptop for robotics development with Python, ROS and computer vision. Budget $1,000, prefer 16 GB RAM and a dedicated GPU.',
  'Find noise cancelling headphones for commuting under $300 and add the best value one.',
  'Build a starter kit for a computer vision robot under $600 and show me the total.',
];

const SESSION_KEY = 'agentcart.session';

function toSteps(executions: Array<{ step: number; tool: string; label: string; status: 'ok' | 'error'; durationMs: number; output: any; error?: string | null }>): TimelineStep[] {
  return executions.map((execution) => ({
    step: execution.step,
    tool: execution.tool,
    label: execution.label,
    status: execution.status,
    durationMs: execution.durationMs,
    error: execution.error ?? undefined,
    summary:
      execution.tool === 'search_products'
        ? `${execution.output?.count ?? 0} catalogue matches`
        : execution.tool === 'compare_products'
          ? `${execution.output?.products?.length ?? 0} compared`
          : execution.tool === 'add_to_cart'
            ? `Added ${execution.output?.added?.name ?? 'item'}`
            : execution.tool === 'prepare_checkout'
              ? 'Approval sheet created, nothing charged'
              : execution.status === 'ok'
                ? 'Completed'
                : execution.error ?? 'Failed',
  }));
}

export default function Workspace() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState(params.get('prompt') ?? '');
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [liveSteps, setLiveSteps] = useState<TimelineStep[]>([]);
  const [liveStatus, setLiveStatus] = useState('Reading your request');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  const { data: cartData } = useQuery({ queryKey: ['cart'], queryFn: api.cart, enabled: Boolean(user) });
  const cart = cartData?.cart;

  useEffect(() => {
    if (hydrated.current || !sessionId) return;
    hydrated.current = true;
    api
      .session(sessionId)
      .then((data) => {
        const restored: ChatEntry[] = (data.messages ?? [])
          .filter((message: any) => message.role === 'user' || message.role === 'assistant')
          .map((message: any) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          }));
        if (restored.length) setMessages(restored);
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
      });
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, liveSteps.length, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    setInput('');
    setPending(true);
    setLiveSteps([]);
    setLiveStatus('Reading your request');
    setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'user', content: trimmed }]);

    try {
      const result = await streamAgentTurn({ message: trimmed, sessionId }, (event) => {
        if (event.type === 'status') setLiveStatus(event.message);
        if (event.type === 'tool_start') {
          setLiveSteps((previous) => [
            ...previous,
            { step: event.step, tool: event.tool, label: event.label, status: 'running' },
          ]);
        }
        if (event.type === 'tool_result') {
          setLiveSteps((previous) =>
            previous.map((step) =>
              step.step === event.step
                ? {
                    ...step,
                    status: event.status,
                    summary: event.summary,
                    durationMs: event.durationMs,
                    error: event.error,
                  }
                : step,
            ),
          );
        }
        if (event.type === 'error') setError(event.message);
      });

      if (result) {
        setMessages((previous) => [
          ...previous,
          { id: crypto.randomUUID(), role: 'assistant', content: result.reply, steps: toSteps(result.executions) },
        ]);
        setSessionId(result.sessionId);
        localStorage.setItem(SESSION_KEY, result.sessionId);
        setLiveSteps([]);
        void queryClient.invalidateQueries({ queryKey: ['cart'] });
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        void queryClient.invalidateQueries({ queryKey: ['activity'] });
      }
    } catch (streamError) {
      setError(
        streamError instanceof ApiError
          ? streamError.message
          : 'The connection to the agent dropped. Nothing was charged. Check the API and try again.',
      );
    } finally {
      setPending(false);
    }
  }

  function newRun() {
    setMessages([]);
    setSessionId(null);
    setLiveSteps([]);
    setError(null);
    localStorage.removeItem(SESSION_KEY);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_332px]">
      <section className="flex min-h-[calc(100vh-7rem)] min-w-0 flex-col">
        <PageHeader
          eyebrow="Workspace"
          title="Agent"
          detail="Describe the purchase. Every tool call below is real: a catalogue read, a cart write or a policy check."
          action={
            <Button variant="secondary" size="sm" onClick={newRun}>
              <RotateCcw size={14} strokeWidth={1.5} /> New run
            </Button>
          }
        />

        <div className="flex flex-col gap-6">
          {messages.length === 0 && !pending ? (
            <Panel className="p-6">
              <p className="font-display text-[27px] leading-tight text-ink">Tell it what you need</p>
              <p className="mt-2 max-w-[56ch] text-[13.5px] leading-6 text-ink-2">
                The agent reads the brief, searches the catalogue, compares specifications and prepares an approval.
                It cannot pay for anything.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void send(example)}
                    className="group flex items-start justify-between gap-4 rounded-md border border-line px-3.5 py-3 text-left transition-colors duration-150 ease-ease hover:border-line-strong hover:bg-raised/50"
                  >
                    <span className="text-[13px] leading-6 text-ink-2">{example}</span>
                    <ChevronRight size={15} strokeWidth={1.5} className="mt-1 shrink-0 text-ink-3" />
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}

          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex gap-3 border-t border-line pt-4">
                <span className="w-9 shrink-0 pt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">You</span>
                <p className="whitespace-pre-wrap text-[14px] leading-7 text-ink">{message.content}</p>
              </div>
            ) : (
              <div key={message.id}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Agent</span>
                  {message.steps?.length ? (
                    <span className="font-mono text-[10px] tabular-nums text-ink-3">
                      {message.steps.length} tool {message.steps.length === 1 ? 'call' : 'calls'}
                    </span>
                  ) : null}
                </div>
                {message.steps?.length ? (
                  <details className="group mb-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-2 transition-colors hover:text-ink">
                      <ChevronRight
                        size={12}
                        strokeWidth={1.5}
                        className="transition-transform duration-150 ease-ease group-open:rotate-90"
                      />
                      Run ledger
                    </summary>
                    <div className="mt-2">
                      <AgentTimeline steps={message.steps} tone="light" />
                    </div>
                  </details>
                ) : null}
                <p className="whitespace-pre-wrap text-[13.5px] leading-[1.75] text-ink">{message.content}</p>
              </div>
            ),
          )}

          {pending ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Agent</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{liveStatus}</span>
              </div>
              <AgentTimeline
                steps={liveSteps}
                title="Live run"
                meta={liveSteps.length ? `${liveSteps.length} tool ${liveSteps.length === 1 ? 'call' : 'calls'}` : 'starting'}
              />
            </div>
          ) : null}

          {error ? (
            <Notice tone="bad" title="The run stopped">
              {error}
            </Notice>
          ) : null}

          <div ref={endRef} />
        </div>

        <div className="sticky bottom-0 z-10 mt-auto bg-gradient-to-t from-paper via-paper to-transparent pb-4 pt-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <div className="rounded-lg border border-line bg-surface p-2 shadow-sheet transition-colors duration-150 ease-ease focus-within:border-line-strong">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                placeholder="A laptop for robotics with 16 GB RAM and a GPU under $1,000"
                className="w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-6 text-ink outline-none"
                disabled={pending}
              />
              <div className="flex items-center justify-between gap-3 px-2 pt-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  Enter sends · Shift+Enter new line
                </span>
                <Button type="submit" size="sm" disabled={pending || !input.trim()}>
                  {pending ? 'Running' : 'Send'}
                  <ArrowUp size={14} strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <aside className="hidden flex-col gap-4 xl:flex">
        <div className="sticky top-6 flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Cart</h2>
              <span className="font-mono text-[10.5px] tabular-nums text-ink-3">
                {cart?.items.length ?? 0} {(cart?.items.length ?? 0) === 1 ? 'line' : 'lines'}
              </span>
            </div>
            {cart && cart.items.length > 0 ? (
              <>
                <ul>
                  {cart.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                      <div className="h-9 w-11 shrink-0">
                        <ProductFigure
                          product={{ category: item.category, name: item.name, brand: item.brand }}
                          className="h-full w-full"
                          detail={false}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] text-ink">{item.name}</p>
                        <p className="font-mono text-[10.5px] text-ink-3">
                          {item.quantity} × {money(item.unitPriceCents)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] tabular-nums text-ink">{money(item.lineTotalCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] text-ink-2">Total</span>
                    <span className="text-[16px] tabular-nums text-ink">{money(cart.totals.totalCents)}</span>
                  </div>
                  <div className="mt-2 h-1 w-full bg-raised">
                    <div
                      className={cx(
                        'h-1',
                        cart.budgetRemainingCents >= 0 ? 'bg-positive' : 'bg-negative',
                      )}
                      style={{
                        width: `${Math.min(100, Math.round((cart.totals.totalCents / Math.max(cart.policy.maxBudgetCents, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                    {cart.budgetRemainingCents >= 0
                      ? `${money(cart.budgetRemainingCents)} of ${money(cart.policy.maxBudgetCents)} left`
                      : `${money(-cart.budgetRemainingCents)} over budget`}
                  </p>
                  {cart.violations.length > 0 ? (
                    <p className="mt-2 text-[11.5px] leading-4 text-negative">{cart.violations[0].message}</p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Link
                      to="/cart"
                      className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-line text-[12.5px] text-ink transition-colors hover:bg-raised"
                    >
                      Open cart
                    </Link>
                    <Link
                      to="/cart"
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-ink text-[12.5px] text-paper transition-colors hover:bg-night-2"
                    >
                      <ShieldCheck size={13} strokeWidth={1.6} /> Approve
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <p className="px-4 py-5 text-[12.5px] leading-5 text-ink-3">
                Nothing in the cart yet. Ask for a product and the agent will build it.
              </p>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Purchasing policy</h2>
              <Link to="/settings" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 hover:text-ink">
                Edit
              </Link>
            </div>
            <dl className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-ink-2">Budget</dt>
                <dd className="tabular-nums text-ink">{money(cart?.policy.maxBudgetCents ?? 100000)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Max per item</dt>
                <dd className="tabular-nums text-ink">{cart?.policy.maxQuantity ?? 3}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Approval</dt>
                <dd className="text-ink">{cart?.policy.requireApproval ? 'Always required' : 'Required'}</dd>
              </div>
            </dl>
          </Panel>

          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line-strong px-4 py-3">
            <StatusDot
              tone="neutral"
              label={`Tools run on the server, ${cart?.items.length ? 'cart synced' : 'no cart writes'}`}
            />
            <p className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-ink-3">
              Agent decisions are logged to the activity ledger with inputs and outputs.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
