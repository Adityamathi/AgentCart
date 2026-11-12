import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Plus, SplitSquareHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import { money, specLabel } from '../lib/format';
import { ProductFigure } from '../components/ProductFigure';
import { Button, EmptyState, Input, Notice, PageHeader, Spinner, StatusDot, cx } from '../components/ui';

export default function Compare() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
  const [requirementText, setRequirementText] = useState('');
  const [requirements, setRequirements] = useState<string[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['compare', ids.join(','), requirements],
    queryFn: () => api.compare({ ids, requirements }),
    enabled: ids.length >= 2,
  });

  const { data: details } = useQuery({
    queryKey: ['compare-products', ids.join(',')],
    queryFn: () => Promise.all(ids.map((id) => api.product(id))),
    enabled: ids.length >= 2,
  });

  const addMutation = useMutation({
    mutationFn: (productId: string) => api.addToCart(productId, 1),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (ids.length < 2) {
    return (
      <div>
        <PageHeader eyebrow="Comparison" title="Compare products" detail="Two to four records, side by side, with the requirement checks behind each recommendation." />
        <EmptyState
          icon={<SplitSquareHorizontal size={20} strokeWidth={1.5} />}
          title="Select at least two products"
          detail="Open the catalogue, tick Compare on two to four records, then use the comparison tray."
          action={<Link to="/catalog" className="text-[13px] text-accent-ink underline underline-offset-2">Go to the catalogue</Link>}
        />
      </div>
    );
  }

  const products = (details ?? []).map((entry) => entry.product);
  const rows = data?.dimensions ?? [];
  const cheapestId = data?.cheapestId;

  return (
    <div>
      <PageHeader
        eyebrow="Comparison"
        title="Specifications side by side"
        detail="Values come from catalogue records, not from a model. Requirement checks quote the field they were read from."
        action={
          <Link to="/catalog" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-raised hover:text-ink">
            <ArrowLeft size={13} strokeWidth={1.5} /> Catalogue
          </Link>
        }
      />

      <form
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setRequirements(
            requirementText
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
              .slice(0, 8),
          );
        }}
      >
        <Input
          value={requirementText}
          onChange={(event) => setRequirementText(event.target.value)}
          placeholder="Requirements to test, for example: 16 GB RAM, dedicated GPU, Linux"
          aria-label="Requirements"
        />
        <Button type="submit" variant="secondary" className="shrink-0 whitespace-nowrap">
          Check requirements
        </Button>
      </form>

      {isLoading ? (
        <Spinner label="Comparing records" />
      ) : error ? (
        <Notice tone="bad" title="Comparison failed">
          {(error as Error).message}
        </Notice>
      ) : data ? (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className="grid gap-px overflow-hidden rounded-t-lg border border-line bg-line"
              style={{ gridTemplateColumns: `160px repeat(${data.products.length}, minmax(0, 1fr))` }}
            >
              <div className="bg-surface px-3 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Record</p>
              </div>
              {products.map((product) => (
                <div key={product.id} className="bg-surface p-3">
                  <ProductFigure product={product} className="aspect-[16/10] w-full" detail={false} />
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">{product.brand}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-ink">{product.name}</p>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className={cx('text-[14px] tabular-nums', product.id === cheapestId ? 'text-ink' : 'text-ink-2')}>
                      {money(product.priceCents)}
                    </span>
                    {product.id === cheapestId ? (
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent-ink">Lowest</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusDot tone={product.stock > 0 ? 'ok' : 'bad'} label={product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'} />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={product.stock <= 0}
                      loading={addMutation.isPending && addMutation.variables === product.id}
                      onClick={() => addMutation.mutate(product.id)}
                    >
                      <Plus size={12} strokeWidth={2} /> Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-b-lg border border-t-0 border-line">
              {rows.map((row) => (
                <div
                  key={row.spec}
                  className="grid gap-px border-b border-line bg-line last:border-0"
                  style={{ gridTemplateColumns: `160px repeat(${data.products.length}, minmax(0, 1fr))` }}
                >
                  <div className="bg-paper px-3 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{specLabel(row.spec)}</span>
                  </div>
                  {row.values.map((value) => (
                    <div key={value.productId} className="bg-surface px-3 py-2.5">
                      <span className="text-[12.5px] leading-5 text-ink">{value.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {data?.products.some((product) => product.requirementChecks) ? (
        <section className="mt-8">
          <h2 className="text-[14px] font-medium text-ink">Requirement checks</h2>
          <p className="mt-1 text-[12.5px] text-ink-2">Each line names the catalogue field it was read from.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {data.products.map((product) => (
              <div key={product.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] text-ink">{product.name}</p>
                  <span className="font-mono text-[10.5px] tabular-nums text-ink-3">
                    {product.requirementChecks?.met ?? 0}/{product.requirementChecks?.checks.length ?? 0} met
                  </span>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {(product.requirementChecks?.checks ?? []).map((check) => (
                    <li key={check.requirement} className="flex items-start gap-2">
                      {check.satisfied ? (
                        <Check size={13} strokeWidth={1.8} className="mt-1 shrink-0 text-positive" />
                      ) : (
                        <X size={13} strokeWidth={1.8} className="mt-1 shrink-0 text-negative" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12.5px] text-ink">{check.requirement}</p>
                        <p className="text-[11.5px] leading-4 text-ink-3">{check.evidence}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <p className="max-w-[70ch] text-[12.5px] leading-5 text-ink-2">
          Want the reasoning in prose, with budget and stock taken into account? The agent reads these same records.
        </p>
        <Link
          to={`/app?prompt=${encodeURIComponent('Compare these products for me and pick one: ' + ids.join(', '))}`}
          className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-[12.5px] text-paper transition-colors hover:bg-night-2"
        >
          Ask the agent
        </Link>
      </div>
    </div>
  );
}
