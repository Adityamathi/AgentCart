import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { ButtonLink, StatusDot, cx } from '../components/ui';
import { ProductFigure } from '../components/ProductFigure';
import { Wordmark } from '../components/Shell';

const RUN_STEPS = [
  ['01', 'Reading the brief', 'Robotics development · CUDA · 16 GB RAM · under $1,000'],
  ['02', 'Searching the catalogue', '6 laptop records matched, 3 within budget'],
  ['03', 'Comparing specifications', 'GPU, memory, storage and Linux support'],
  ['04', 'Assembling the cart', 'Policy checked: $948.00 of $1,000.00'],
  ['05', 'Awaiting your approval', 'PayPal order not created until you approve'],
] as const;

export default function Landing() {
  const { user } = useAuth();
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 30_000 });
  const { data: featured } = useQuery({
    queryKey: ['landing-featured'],
    queryFn: () => api.products({ category: 'laptops', sort: 'rating', limit: '3' }),
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-6 px-5 lg:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-7 text-[13.5px] text-ink-2 md:flex">
            <a href="#how" className="transition-colors hover:text-ink">
              How a run works
            </a>
            <a href="#approval" className="transition-colors hover:text-ink">
              Approval
            </a>
            <Link to="/catalog" className="transition-colors hover:text-ink">
              Catalogue
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <ButtonLink to="/app" variant="primary" size="sm">
                Open workspace
              </ButtonLink>
            ) : (
              <>
                <Link to="/login" className="hidden text-[13.5px] text-ink-2 transition-colors hover:text-ink sm:block">
                  Sign in
                </Link>
                <ButtonLink to="/login?mode=register" variant="primary" size="sm">
                  Start a run
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1280px] px-5 pb-16 pt-12 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_1fr] lg:gap-16">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                AI purchasing agent · PayPal Orders v2
              </p>
              <h1 className="mt-5 max-w-[15ch] font-display text-[46px] leading-[1.04] tracking-[-0.02em] text-ink sm:text-[58px] lg:text-[64px]">
                Your intent. Our intelligence. Your approval.
              </h1>
              <p className="mt-6 max-w-[48ch] text-[15px] leading-7 text-ink-2">
                Say what you need. AgentCart searches a real catalogue, compares the specifications that matter,
                builds a cart inside your limits and stops at the payment until you approve it.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink to={user ? '/app' : '/login?mode=register'} size="lg">
                  {user ? 'Open the workspace' : 'Start a shopping run'}
                  <ArrowRight size={16} strokeWidth={1.5} />
                </ButtonLink>
                <ButtonLink to="/catalog" variant="secondary" size="lg">
                  Browse the catalogue
                </ButtonLink>
              </div>
              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                <div className="flex items-baseline gap-2">
                  <dt className="sr-only">Catalogue records</dt>
                  <dd className="tabular-nums text-ink">{health?.catalogueProducts ?? '39'}</dd>
                  <span>catalogue records</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="sr-only">Agent tools</dt>
                  <dd className="tabular-nums text-ink">10</dd>
                  <span>agent tools</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="sr-only">Payment</dt>
                  <dd className="text-ink">Orders v2</dd>
                  <span>sandbox</span>
                </div>
              </dl>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-lift">
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <div>
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Run 04</p>
                    <p className="mt-0.5 text-[13.5px] text-ink">Robotics workstation</p>
                  </div>
                  <StatusDot tone="warn" label="Awaiting approval" />
                </div>

                <div className="border-b border-line bg-night px-5 py-4">
                  <ol className="flex flex-col gap-2.5">
                    {RUN_STEPS.map(([index, label, summary]) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="mt-0.5 font-mono text-[10px] tabular-nums text-night-ink-3">{index}</span>
                        <Check
                          size={11}
                          strokeWidth={2}
                          className={index === '05' ? 'mt-1 text-night-ink-3' : 'mt-1 text-night-ink-2'}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="text-[12px] leading-4 text-night-ink">{label}</p>
                          <p className="truncate text-[10.5px] leading-4 text-night-ink-3">{summary}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="flex divide-x divide-line border-b border-line">
                  {[
                    { brand: 'Lenovo', name: 'LOQ 15IRH8', price: 89900 },
                    { brand: 'Logitech', name: 'M720 Triathlon', price: 4900 },
                  ].map((item) => (
                    <div key={item.name} className="flex flex-1 items-center gap-3 px-4 py-3">
                      <div className="h-11 w-14 shrink-0">
                        <ProductFigure
                          product={{ category: item.brand === 'Lenovo' ? 'laptops' : 'peripherals', name: item.name, brand: item.brand }}
                          className="h-full w-full"
                          detail={false}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] text-ink">{item.name}</p>
                        <p className="text-[11.5px] tabular-nums text-ink-2">{money(item.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">Cart total</p>
                    <p className="mt-0.5 text-[19px] tabular-nums text-ink">{money(94800)}</p>
                  </div>
                  <span className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[12.5px] font-medium text-white">
                    Review approval
                  </span>
                </div>
                <p className="border-t border-line px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  Nothing charged until you approve
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-line bg-surface/60">
          <div className="mx-auto max-w-[1280px] px-5 py-16 lg:px-8 lg:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="max-w-[34ch] text-[24px] leading-tight tracking-[-0.01em] text-ink">
                A shopping run is a sequence of tool calls, not a conversation
              </h2>
              <p className="max-w-[38ch] text-[13.5px] leading-6 text-ink-2">
                Every step below is an execution you can inspect: what was called, what came back and how long it took.
              </p>
            </div>

            <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['01', 'Read the brief', 'Budget, category and the specifications you actually named.'],
                ['02', 'Search the catalogue', 'Records from the server catalogue, never a model guess.'],
                ['03', 'Compare and select', 'Requirement checks with the catalogue text behind each one.'],
                ['04', 'Prepare approval', 'Policy validated, prices locked, PayPal waiting for you.'],
              ].map(([index, title, detail]) => (
                <li key={index} className="bg-paper px-5 py-6">
                  <p className="font-mono text-[11px] tabular-nums text-accent">{index}</p>
                  <h3 className="mt-3 text-[14px] font-medium text-ink">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-ink-2">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="approval" className="border-t border-line">
          <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:py-20">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Financial control</p>
              <h2 className="mt-4 max-w-[22ch] text-[30px] leading-[1.15] tracking-[-0.015em] text-ink">
                The agent stops where the money starts
              </h2>
              <p className="mt-5 max-w-[52ch] text-[14.5px] leading-7 text-ink-2">
                AgentCart can search, compare, decide and assemble a cart. It cannot charge you. The server validates
                the cart against your purchasing policy, snapshots the prices and hands you an approval sheet. The
                PayPal order is created only after you approve it.
              </p>
              <ul className="mt-7 flex flex-col gap-3">
                {[
                  'Budget, category and quantity limits are enforced on the server',
                  'PayPal amounts come from the order record, never the browser',
                  'Captures are verified, recorded and safe to retry',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13.5px] leading-6 text-ink-2">
                    <Check size={14} strokeWidth={1.8} className="mt-1 shrink-0 text-positive" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-surface">
              <div className="flex items-start justify-between border-b border-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Approval sheet</p>
                  <p className="mt-1 text-[14px] text-ink">Order 8f2a-41c7</p>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-warn">Awaiting signature</span>
              </div>
              <div className="px-5 py-4">
                {[
                  ['Lenovo LOQ 15IRH8', '1 × $899.00'],
                  ['Logitech M720 Triathlon', '1 × $49.00'],
                  ['Shipping', '$0.00'],
                  ['Tax', '$0.00'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                    <span className="text-[13px] text-ink-2">{label}</span>
                    <span className="text-[13px] tabular-nums text-ink">{value}</span>
                  </div>
                ))}
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-[13px] text-ink-2">Total, in USD</span>
                  <span className="text-[22px] tabular-nums text-ink">{money(94800)}</span>
                </div>
              </div>
              <div className="border-t border-line px-5 py-4">
                <div className="flex h-9 items-center justify-center rounded-md bg-accent text-[13px] font-medium text-white">
                  Approve and continue to PayPal
                </div>
                <p className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  PayPal sandbox · approval required every purchase
                </p>
              </div>
            </div>
          </div>
        </section>

        {featured?.products?.length ? (
          <section className="border-t border-line bg-surface/60">
            <div className="mx-auto max-w-[1280px] px-5 py-16 lg:px-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-[20px] leading-tight text-ink">In the catalogue</h2>
                  <p className="mt-1 text-[13px] text-ink-2">Sample records with indicative prices, not live merchant inventory.</p>
                </div>
                <Link to="/catalog" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
                  All records <ArrowRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.products.slice(0, 3).map((product) => (
                  <Link
                    key={product.id}
                    to={`/catalog/${product.id}`}
                    className="group rounded-lg border border-line bg-surface p-3 transition-colors duration-150 ease-ease hover:border-line-strong"
                  >
                    <ProductFigure product={product} className="aspect-[4/3] w-full" />
                    <div className="mt-3 flex items-start justify-between gap-3 px-1">
                      <div className="min-w-0">
                        <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{product.brand}</p>
                        <p className="mt-1 truncate text-[13.5px] text-ink">{product.name}</p>
                      </div>
                      <p className="shrink-0 text-[13.5px] tabular-nums text-ink">{money(product.priceCents)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-10 text-[12.5px] text-ink-2 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="max-w-[42ch]">
            <Wordmark />
            <p className="mt-3 leading-6">
              AgentCart is built for the PayPal AI Hackathon 2026. Catalogue prices are sample data. Payments run in
              PayPal sandbox when keys are configured.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
              <span>Agent · {health?.ai.provider ?? 'local planner'}</span>
              <span>PayPal · {health?.paypal.configured ? health.paypal.environment : 'not configured'}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Project</p>
            <Link to="/catalog" className="hover:text-ink">
              Catalogue
            </Link>
            <Link to="/app" className="hover:text-ink">
              Workspace
            </Link>
            <Link to="/activity" className="hover:text-ink">
              Agent activity
            </Link>
          </div>
          <div className="flex max-w-[34ch] flex-col gap-2">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Design credit</p>
            <p className="leading-6">
              Interface reviewed with{' '}
              <a
                href="https://github.com/heydamir/unslop"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline decoration-line-strong underline-offset-2"
              >
                unslop
              </a>{' '}
              by Damir Sokolovsky (@heydamir), CC BY 4.0.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
