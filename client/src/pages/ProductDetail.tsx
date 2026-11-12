import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Minus, Plus, SplitSquareHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import { CATEGORY_LABELS, money, specLabel } from '../lib/format';
import { ProductFigure } from '../components/ProductFigure';
import { Button, ButtonLink, Notice, Panel, Spinner, StatusDot } from '../components/ui';

export default function ProductDetail() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const { data, isLoading, error } = useQuery({ queryKey: ['product', id], queryFn: () => api.product(id), enabled: Boolean(id) });

  const addMutation = useMutation({
    mutationFn: () => api.addToCart(id, quantity),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (isLoading) return <Spinner label="Reading the catalogue record" />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[520px] py-16">
        <Notice tone="bad" title="Record not found">
          That catalogue id does not exist. <Link to="/catalog" className="underline">Back to the catalogue</Link>.
        </Notice>
      </div>
    );
  }

  const product = data.product;
  const prompt = `Tell me whether the ${product.brand} ${product.name} fits my needs, and what it misses.`;

  return (
    <div>
      <Link to="/catalog" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={1.5} /> Catalogue
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <ProductFigure product={product} className="aspect-[4/3] w-full" />
          <div className="mt-6">
            <h2 className="text-[14px] font-medium text-ink">About this record</h2>
            <p className="mt-2 max-w-[62ch] text-[13.5px] leading-6 text-ink-2">{product.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {product.tags.slice(0, 10).map((tag) => (
                <span key={tag} className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
            {product.brand} · {CATEGORY_LABELS[product.category] ?? product.category}
          </p>
          <h1 className="mt-2 text-[30px] leading-tight tracking-[-0.015em] text-ink">{product.name}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-[26px] tabular-nums text-ink">{money(product.priceCents)}</span>
            <StatusDot
              tone={product.stock > 5 ? 'ok' : product.stock > 0 ? 'warn' : 'bad'}
              label={product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            />
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
            Sample catalogue price · SKU {product.sku}
          </p>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex h-10 items-center rounded-md border border-line bg-surface">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="flex h-10 w-9 items-center justify-center text-ink-2 transition-colors hover:text-ink"
                aria-label="Decrease quantity"
              >
                <Minus size={14} strokeWidth={1.8} />
              </button>
              <span className="w-6 text-center text-[13px] tabular-nums text-ink">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(10, value + 1))}
                className="flex h-10 w-9 items-center justify-center text-ink-2 transition-colors hover:text-ink"
                aria-label="Increase quantity"
              >
                <Plus size={14} strokeWidth={1.8} />
              </button>
            </div>
            <Button
              className="flex-1"
              disabled={product.stock <= 0}
              loading={addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isSuccess ? <Check size={15} strokeWidth={2} /> : <Plus size={15} strokeWidth={2} />}
              {addMutation.isSuccess ? 'Added to cart' : 'Add to cart'}
            </Button>
          </div>

          {addMutation.isError ? (
            <div className="mt-3">
              <Notice tone="bad">{(addMutation.error as Error).message}</Notice>
            </div>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Link
              to={`/compare?ids=${product.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
            >
              <SplitSquareHorizontal size={13} strokeWidth={1.5} /> Compare
            </Link>
            <Link
              to={`/app?prompt=${encodeURIComponent(prompt)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
            >
              Ask the agent
            </Link>
          </div>

          <Panel className="mt-6 overflow-hidden">
            <div className="border-b border-line px-4 py-2.5">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Specifications</h2>
            </div>
            <dl>
              {Object.entries(product.specs).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[128px_1fr] gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">{specLabel(key)}</dt>
                  <dd className="text-[12.5px] leading-5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <div className="mt-10 grid gap-6 border-t border-line pt-8 sm:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <Check size={14} strokeWidth={2} className="text-positive" /> What it does well
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {product.pros.map((pro) => (
              <li key={pro} className="border-l border-line pl-3 text-[13px] leading-6 text-ink-2">
                {pro}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <X size={14} strokeWidth={2} className="text-negative" /> What it gives up
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {product.cons.map((con) => (
              <li key={con} className="border-l border-line pl-3 text-[13px] leading-6 text-ink-2">
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <p className="text-[12.5px] text-ink-2">
          Buying inside a policy? The agent checks budget and category before it prepares an approval.
        </p>
        <ButtonLink to="/app" variant="secondary" size="sm">
          Open the agent
        </ButtonLink>
      </div>
    </div>
  );
}
