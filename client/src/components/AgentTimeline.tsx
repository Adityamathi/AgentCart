import { Check, Loader2, X } from 'lucide-react';
import { cx } from './ui';

export interface TimelineStep {
  step: number;
  tool: string;
  label: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
  durationMs?: number;
  error?: string;
}

export function AgentTimeline({
  steps,
  tone = 'dark',
  title = 'Run ledger',
  meta,
  className,
}: {
  steps: TimelineStep[];
  tone?: 'dark' | 'light';
  title?: string;
  meta?: string;
  className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <section
      className={cx(
        'overflow-hidden rounded-lg border',
        dark ? 'border-night-3 bg-night text-night-ink' : 'border-line bg-surface text-ink',
        className,
      )}
    >
      <header
        className={cx(
          'flex items-center justify-between gap-3 border-b px-4 py-2.5',
          dark ? 'border-night-line' : 'border-line',
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cx('h-[5px] w-[5px]', dark ? 'bg-night-ink-2' : 'bg-ink-2')} aria-hidden />
          <h3 className={cx('font-mono text-[10.5px] uppercase tracking-[0.12em]', dark ? 'text-night-ink-2' : 'text-ink-2')}>
            {title}
          </h3>
        </div>
        <span className={cx('font-mono text-[10.5px] tabular-nums', dark ? 'text-night-ink-3' : 'text-ink-3')}>
          {meta ?? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`}
        </span>
      </header>

      {steps.length === 0 ? (
        <p className={cx('px-4 py-4 text-[12.5px]', dark ? 'text-night-ink-3' : 'text-ink-3')}>
          Tool calls appear here as the agent makes them.
        </p>
      ) : (
        <ol>
          {steps.map((step, index) => (
            <li
              key={`${step.step}-${step.tool}`}
              className={cx(
                'flex items-start gap-3 px-4 py-2.5',
                index !== steps.length - 1 && (dark ? 'border-b border-night-line' : 'border-b border-line'),
              )}
            >
              <span
                className={cx(
                  'mt-0.5 w-6 shrink-0 font-mono text-[10.5px] tabular-nums',
                  dark ? 'text-night-ink-3' : 'text-ink-3',
                )}
              >
                {String(step.step).padStart(2, '0')}
              </span>
              <span className="mt-[3px] shrink-0">
                {step.status === 'running' ? (
                  <Loader2 size={12} className="animate-spin text-accent" aria-hidden />
                ) : step.status === 'error' ? (
                  <X size={12} className="text-negative" aria-hidden />
                ) : (
                  <Check size={12} className={dark ? 'text-night-ink-2' : 'text-positive'} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx('text-[12.5px] leading-5', dark ? 'text-night-ink' : 'text-ink')}>{step.label}</p>
                {step.summary ? (
                  <p className={cx('mt-0.5 text-[11.5px] leading-4', dark ? 'text-night-ink-3' : 'text-ink-3')}>
                    {step.summary}
                  </p>
                ) : null}
                {step.error ? <p className="mt-0.5 text-[11.5px] leading-4 text-negative">{step.error}</p> : null}
              </div>
              <span
                className={cx(
                  'mt-0.5 shrink-0 font-mono text-[10.5px] tabular-nums',
                  dark ? 'text-night-ink-3' : 'text-ink-3',
                )}
              >
                {step.durationMs !== undefined ? `${step.durationMs} ms` : '—'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
