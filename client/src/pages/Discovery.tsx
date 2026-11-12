import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Search, SplitSquareHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import { CATEGORY_LABELS, money } from '../lib/format';
import { ProductFigure } from '../components/ProductFigure';
import { Button, EmptyState, Input, PageHeader, Select, Spinner, StatusDot, buttonClass, cx } from '../components/ui';

export default function Discovery() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const inStock = params.get('inStock') === 'true';
  const [term, setTerm] = useState(q);
  const [selected, setSelected] = useState<string[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => setTerm(q), [q]);

  useEffect(() => {
    if (term === q) return;
    const timeout = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term) next.set('q', term);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', q, category, sort, inStock],
    queryFn: () =>
      api.products({
        q: q || undefined,
        category: category || undefined,
        sort,
        inStock: inStock ? 'true' : undefined,
      }),
  });

  const addMutation = useMutation({
    mutationFn: (productId: string) => api.addToCart(productId, 1),
    onSuccess: (_data, productId) => {
      setAdded(productId);
      window.setTimeout(() => setAdded(null), 1600);
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];
  const selectedProducts = useMemo(
    () => products.filter((product) => selected.includes(product.id)),
    [products, selected],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function toggleCompare(id: string) {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : previous.length >= 4 ? previous : [...previous, id],
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue"
        title="Product discovery"
        detail="Sample catalogue records with indicative prices. Search and filtering work without the agent, so the store stays usable if a model key is missing."
        action={
          selected.length >= 2 ? (
            <Link to={`/compare?ids=${selected.join(',')}`} className={buttonClass('primary', 'sm')}>
              <SplitSquareHorizontal size={14} strokeWidth={1.5} /> Compare {selected.length}
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search the catalogue"
            className="pl-9"
            aria-label="Search the catalogue"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[172px] shrink-0">
            <Select value={category} onChange={(event) => setParam('category', event.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[172px] shrink-0">
            <Select value={sort} onChange={(event) => setParam('sort', event.target.value)} aria-label="Sort">
              <option value="relevance">Relevance</option>
              <option value="price_asc">Price, low to high</option>
              <option value="price_desc">Price, high to low</option>
              <option value="rating">Rating</option>
              <option value="name">Name</option>
            </Select>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(event) => setParam('inStock', event.target.checked ? 'true' : '')}
              className="h-3.5 w-3.5 accent-accent"
            />
            In stock
          </label>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between border-b border-line pb-2.5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
          {isLoading ? 'Searching' : `${products.length} ${products.length === 1 ? 'record' : 'records'}`}
          {q ? ` for “${q}”` : ''}
          {category ? ` · ${CATEGORY_LABELS[category] ?? category}` : ''}
        </p>
        <p className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3 sm:block">
          Select up to four to compare
        </p>
      </div>

      {isLoading ? (
        <Spinner label="Reading the catalogue" />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Search size={20} strokeWidth={1.5} />}
          title="No records matched"
          detail="Try a broader term, another category or turn off the stock filter. The catalogue holds 39 sample records."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setParams(new URLSearchParams(), { replace: true });
                setTerm('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const isSelected = selected.includes(product.id);
            const specEntries = Object.entries(product.specs).slice(0, 3);
            return (
              <article
                key={product.id}
                className={cx(
                  'flex flex-col rounded-lg border bg-surface p-3 transition-colors duration-150 ease-ease',
                  isSelected ? 'border-accent/50' : 'border-line hover:border-line-strong',
                )}
              >
                <Link to={`/catalog/${product.id}`} className="block">
                  <ProductFigure product={product} className="aspect-[4/3] w-full" />
                </Link>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{product.brand}</p>
                    <Link to={`/catalog/${product.id}`} className="mt-1 block truncate text-[14px] text-ink hover:underline">
                      {product.name}
                    </Link>
                  </div>
                  <p className="shrink-0 text-[14px] tabular-nums text-ink">{money(product.priceCents)}</p>
                </div>
                <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-2.5">
                  {specEntries.map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{key}</dt>
                      <dd className="truncate text-[12px] text-ink-2" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <StatusDot
                    tone={product.stock > 5 ? 'ok' : product.stock > 0 ? 'warn' : 'bad'}
                    label={product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleCompare(product.id)}
                      className={cx(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors duration-150 ease-ease',
                        isSelected
                          ? 'border-accent/40 bg-accent-wash text-accent-ink'
                          : 'border-line text-ink-2 hover:bg-raised hover:text-ink',
                      )}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? <Check size={12} strokeWidth={2} /> : <SplitSquareHorizontal size={12} strokeWidth={1.5} />}
                      {isSelected ? 'Selected' : 'Compare'}
                    </button>
                    <Button
                      size="sm"
                      variant={product.stock > 0 ? 'primary' : 'secondary'}
                      disabled={product.stock <= 0}
                      loading={addMutation.isPending && addMutation.variables === product.id}
                      onClick={() => addMutation.mutate(product.id)}
                    >
                      {added === product.id ? <Check size={13} strokeWidth={2} /> : <Plus size={13} strokeWidth={2} />}
                      {added === product.id ? 'Added' : 'Add'}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected.length > 0 ? (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-[640px] lg:left-[248px]">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-lift">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Comparison tray</p>
              <p className="mt-0.5 truncate text-[12.5px] text-ink">
                {selectedProducts.map((product) => product.name).join(' · ') || `${selected.length} selected`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected([])}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-ink-3 hover:text-ink"
              >
                <X size={13} strokeWidth={1.5} /> Clear
              </button>
              <Link
                to={`/compare?ids=${selected.join(',')}`}
                className={cx(buttonClass('primary', 'sm'), selected.length < 2 && 'pointer-events-none opacity-50')}
              >
                Compare {selected.length}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
