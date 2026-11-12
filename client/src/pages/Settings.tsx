import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY_LABELS, money, toCents } from '../lib/format';
import { Button, Field, Input, Notice, PageHeader, Panel, Select, StatusDot, cx } from '../components/ui';

const CATEGORY_IDS = ['laptops', 'smartphones', 'headphones', 'peripherals', 'accessories', 'electronics'];

export default function Settings() {
  const queryClient = useQueryClient();
  const { me, refresh } = useAuth();
  const { data } = useQuery({ queryKey: ['policy'], queryFn: api.policy });
  const memoryQuery = useQuery({ queryKey: ['memory'], queryFn: api.memory });

  const [budget, setBudget] = useState('1000.00');
  const [maxQuantity, setMaxQuantity] = useState('3');
  const [allowed, setAllowed] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [requireApproval, setRequireApproval] = useState(true);
  const [notes, setNotes] = useState('');
  const [brands, setBrands] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setBudget((data.policy.maxBudgetCents / 100).toFixed(2));
    setMaxQuantity(String(data.policy.maxQuantity));
    setAllowed(data.policy.allowedCategories);
    setBlocked(data.policy.blockedCategories);
    setRequireApproval(data.policy.requireApproval);
  }, [data]);

  useEffect(() => {
    if (!memoryQuery.data) return;
    setNotes((memoryQuery.data.memory.notes ?? []).join('\n'));
    setBrands((memoryQuery.data.memory.preferred_brands ?? []).join(', '));
  }, [memoryQuery.data]);

  const savePolicy = useMutation({
    mutationFn: () =>
      api.savePolicy({
        maxBudgetCents: toCents(budget),
        maxQuantity: Number(maxQuantity) || 1,
        allowedCategories: allowed,
        blockedCategories: blocked,
        requireApproval,
      }),
    onSuccess: async () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      await queryClient.invalidateQueries({ queryKey: ['policy'] });
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      await refresh();
    },
  });

  const saveMemory = useMutation({
    mutationFn: () =>
      api.saveMemory({
        notes: notes.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12),
        preferred_brands: brands.split(',').map((line) => line.trim()).filter(Boolean).slice(0, 12),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
      await refresh();
    },
  });

  const clearMemory = useMutation({
    mutationFn: () => api.saveMemory({ notes: [], preferred_brands: [] }),
    onSuccess: async () => {
      setNotes('');
      setBrands('');
      await queryClient.invalidateQueries({ queryKey: ['memory'] });
      await refresh();
    },
  });

  function toggleCategory(category: string, list: string[], setList: (value: string[]) => void) {
    setList(list.includes(category) ? list.filter((entry) => entry !== category) : [...list, category]);
  }

  const integrations = me?.integrations;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Purchasing policy"
        detail="The server enforces these limits on every cart and every checkout. The agent cannot override them."
        action={
          saved ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-positive">
              <Check size={14} strokeWidth={2} /> Saved
            </span>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Panel className="p-5">
            <h2 className="text-[14px] font-medium text-ink">Limits</h2>
            <p className="mt-1 text-[12.5px] leading-5 text-ink-2">
              Budget applies to the order total including shipping and tax.
            </p>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                savePolicy.mutate();
              }}
            >
              <Field label="Maximum budget, USD" hint={`Currently ${money(data?.policy.maxBudgetCents ?? 100000)}`}>
                <Input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Maximum quantity per item">
                <Select value={maxQuantity} onChange={(event) => setMaxQuantity(event.target.value)}>
                  {[1, 2, 3, 4, 5, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="sm:col-span-2">
                <p className="mb-1.5 text-[13px] font-medium text-ink">Allowed categories</p>
                <p className="mb-2 text-[12px] text-ink-3">Leave all unselected to allow every category.</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_IDS.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        toggleCategory(category, allowed, setAllowed);
                        setBlocked((previous) => previous.filter((entry) => entry !== category));
                      }}
                      className={cx(
                        'h-8 rounded-md border px-2.5 text-[12px] transition-colors duration-150 ease-ease',
                        allowed.includes(category)
                          ? 'border-accent/40 bg-accent-wash text-accent-ink'
                          : 'border-line text-ink-2 hover:bg-raised hover:text-ink',
                      )}
                    >
                      {CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="mb-1.5 text-[13px] font-medium text-ink">Blocked categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_IDS.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        toggleCategory(category, blocked, setBlocked);
                        setAllowed((previous) => previous.filter((entry) => entry !== category));
                      }}
                      className={cx(
                        'h-8 rounded-md border px-2.5 text-[12px] transition-colors duration-150 ease-ease',
                        blocked.includes(category)
                          ? 'border-negative/30 bg-negative-wash text-negative'
                          : 'border-line text-ink-2 hover:bg-raised hover:text-ink',
                      )}
                    >
                      {CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(event) => setRequireApproval(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-accent"
                />
                <span>
                  <span className="block text-[13px] text-ink">Require approval for every purchase</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-ink-3">
                    Recommendation: keep this on. Checkout always goes through the approval sheet regardless.
                  </span>
                </span>
              </label>

              <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="submit" loading={savePolicy.isPending}>
                  <ShieldCheck size={14} strokeWidth={1.6} /> Save policy
                </Button>
                {savePolicy.isError ? (
                  <span className="text-[12px] text-negative">{(savePolicy.error as Error).message}</span>
                ) : null}
              </div>
            </form>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[14px] font-medium text-ink">Shopping memory</h2>
            <p className="mt-1 text-[12.5px] leading-5 text-ink-2">
              Non-sensitive notes the agent reads at the start of a run. Do not store addresses, card numbers or
              anything you would not want in a log.
            </p>
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveMemory.mutate();
              }}
            >
              <Field label="Notes, one per line">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-6 text-ink transition-colors duration-150 ease-ease focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder={'Development workstation for a robotics lab\nPrefers NVIDIA GPUs for CUDA work'}
                />
              </Field>
              <Field label="Preferred brands" hint="Comma separated, optional">
                <Input value={brands} onChange={(event) => setBrands(event.target.value)} placeholder="Lenovo, Logitech" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="secondary" loading={saveMemory.isPending}>
                  Save memory
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  loading={clearMemory.isPending}
                  onClick={() => clearMemory.mutate()}
                >
                  <Trash2 size={13} strokeWidth={1.5} /> Clear memory
                </Button>
              </div>
            </form>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Integrations</h2>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <StatusDot
                  tone={integrations?.ai.live ? 'ok' : 'warn'}
                  label={integrations?.ai.live ? 'Model connected' : 'Local planner'}
                />
                <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                  {integrations?.ai.provider} · {integrations?.ai.model}
                </p>
              </div>
              <div>
                <StatusDot
                  tone={integrations?.paypal.configured ? 'ok' : 'warn'}
                  label={integrations?.paypal.configured ? 'PayPal sandbox ready' : 'PayPal keys missing'}
                />
                <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                  webhooks {integrations?.paypal.webhookConfigured ? 'verified' : 'not configured'}
                </p>
              </div>
              <div>
                <StatusDot tone="neutral" label={`Database · ${integrations?.database.driver ?? 'sqlite'}`} />
                <p className="mt-1 font-mono text-[10.5px] text-ink-3">catalogue and orders live on the server</p>
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-[12px] leading-5 text-ink-2">
                Keys belong in the server environment, never in this page. The app reads them at startup.
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-paper px-2.5 py-2 font-mono text-[10px] leading-4 text-ink-2">
{`AI_PROVIDER=gemini
GEMINI_API_KEY=...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...`}
              </pre>
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Account</h2>
            <dl className="mt-3 flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Name</dt>
                <dd className="text-ink">{me?.user.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Email</dt>
                <dd className="truncate font-mono text-[11px] text-ink">{me?.user.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Policy updated</dt>
                <dd className="font-mono text-[10.5px] text-ink">{data?.policy.updatedAt ? new Date(data.policy.updatedAt).toLocaleDateString() : 'never'}</dd>
              </div>
            </dl>
          </Panel>

          <Notice tone="neutral" title="What the agent cannot do">
            It cannot change this policy, capture a payment, or read your PayPal credentials. Tool calls are limited to
            catalogue reads, cart writes and the approval preparation below.
          </Notice>
        </div>
      </div>
    </div>
  );
}
