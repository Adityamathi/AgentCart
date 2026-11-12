import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity as ActivityIcon, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { clockTime, dateTime, money } from '../lib/format';
import { AgentTimeline, type TimelineStep } from '../components/AgentTimeline';
import { EmptyState, PageHeader, Panel, Spinner, StatusDot, cx } from '../components/ui';

export default function Activity() {
  const [sessionFilter, setSessionFilter] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['activity'], queryFn: api.activity });

  const executions = (data?.executions ?? []).filter((entry) => !sessionFilter || entry.sessionId === sessionFilter);
  const sessions = data?.sessions ?? [];

  const steps: TimelineStep[] = executions
    .slice(0, 12)
    .reverse()
    .map((entry, index) => ({
      step: index + 1,
      tool: entry.tool,
      label: entry.label,
      status: entry.status,
      durationMs: entry.durationMs,
      summary:
        entry.tool === 'search_products'
          ? `${entry.output?.count ?? 0} matches`
          : entry.status === 'ok'
            ? 'Completed'
            : entry.error ?? 'Failed',
    }));

  return (
    <div>
      <PageHeader
        eyebrow="Transparency"
        title="Agent activity"
        detail="Every tool call the agent made on this account, with its input, output and duration. Failed calls are kept."
      />

      {isLoading ? (
        <Spinner label="Reading the ledger" />
      ) : executions.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon size={20} strokeWidth={1.5} />}
          title="No agent runs yet"
          detail="Start a run in the workspace and the tool calls will appear here."
          action={
            <Link to="/app" className="text-[13px] text-accent-ink underline underline-offset-2">
              Open the workspace
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden">
              <div className="border-b border-line px-3.5 py-2.5">
                <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Sessions</h2>
              </div>
              <div className="flex flex-col p-1.5">
                <button
                  onClick={() => setSessionFilter(null)}
                  className={cx(
                    'rounded-md px-2 py-2 text-left text-[12.5px] transition-colors',
                    sessionFilter === null ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised/60',
                  )}
                >
                  All sessions
                  <span className="ml-1 font-mono text-[10px] text-ink-3">· {executions.length + (data?.executions.length ?? 0) > 0 ? data?.executions.length : 0}</span>
                </button>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setSessionFilter(session.id)}
                    className={cx(
                      'rounded-md px-2 py-2 text-left transition-colors',
                      sessionFilter === session.id ? 'bg-raised' : 'hover:bg-raised/60',
                    )}
                  >
                    <span className="block truncate text-[12.5px] text-ink">{session.title}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-3">{dateTime(session.updated_at)}</span>
                  </button>
                ))}
              </div>
            </Panel>

            <AgentTimeline steps={steps} title="Recent calls" meta={`${executions.length} shown`} />
          </div>

          <div className="min-w-0">
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-2">Execution log</h2>
                <span className="font-mono text-[10px] tabular-nums text-ink-3">{executions.length} entries</span>
              </div>
              <ul>
                {executions.map((entry) => (
                  <li key={entry.id} className="border-b border-line last:border-0">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-raised/40">
                        <ChevronRight
                          size={12}
                          strokeWidth={1.5}
                          className="shrink-0 text-ink-3 transition-transform duration-150 ease-ease group-open:rotate-90"
                        />
                        <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                          {clockTime(entry.createdAt)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{entry.label}</span>
                        <span className="font-mono text-[10px] text-ink-3">{entry.tool}</span>
                        <StatusDot tone={entry.status === 'ok' ? 'ok' : 'bad'} label={entry.status} />
                        <span className="w-14 text-right font-mono text-[10px] tabular-nums text-ink-3">{entry.durationMs} ms</span>
                      </summary>
                      <div className="grid gap-3 border-t border-line px-4 py-3 sm:grid-cols-2">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Input</p>
                          <pre className="mt-1 max-h-52 overflow-auto rounded-md border border-line bg-paper p-2 font-mono text-[10.5px] leading-4 text-ink-2">
{JSON.stringify(entry.input, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Output</p>
                          <pre className="mt-1 max-h-52 overflow-auto rounded-md border border-line bg-paper p-2 font-mono text-[10.5px] leading-4 text-ink-2">
{JSON.stringify(entry.output, null, 2)}
                          </pre>
                        </div>
                        {entry.error ? (
                          <p className="text-[12px] text-negative sm:col-span-2">Error: {entry.error}</p>
                        ) : null}
                        <p className="font-mono text-[10px] text-ink-3 sm:col-span-2">
                          {entry.sessionTitle} · {dateTime(entry.createdAt)}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
