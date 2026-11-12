import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { env, activeAiProvider, configuredProviders, defaultModel } from '../env.js';
import { newId, nowIso, parseJson } from '../lib/util.js';
import { getSessionUserMemory } from '../services/memory.js';
import { readCart, type CartView } from '../services/cart.js';
import { executeTool, logToolExecution, stepLabel, type ToolLogEntry } from './tools.js';
import { summarizeToolResult } from './summarize.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { HeuristicProvider } from './providers/heuristic.js';
import type { AgentDeps, AgentEvent, AgentProvider, AgentState } from './types.js';
import type { AgentSessionRow } from '../types.js';

const MAX_TOOL_CALLS_PER_TURN = 14;

export interface AgentTurnResult {
  sessionId: string;
  reply: string;
  provider: AgentProvider['name'];
  model: string;
  executions: ToolLogEntry[];
  cart: CartView;
  approval: { orderId: string; totalCents: number } | null;
}

function createProviders(): AgentProvider[] {
  const modelProviders: AgentProvider[] = configuredProviders().map((name) => {
    if (name === 'gemini') return new GeminiProvider();
    if (name === 'groq') {
      return new OpenAIProvider({
        name: 'groq',
        baseUrl: env.groqBaseUrl,
        apiKey: env.groqKey,
        model: env.groqModel,
      });
    }
    return new OpenAIProvider();
  });
  return [...modelProviders, new HeuristicProvider()];
}

async function ensureSession(userId: string, sessionId: string | null | undefined, firstText: string): Promise<AgentSessionRow> {
  if (sessionId) {
    const existing = await db.one<AgentSessionRow>(`SELECT * FROM agent_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
    if (existing) return existing;
  }
  const timestamp = nowIso();
  const session: AgentSessionRow = {
    id: newId(),
    user_id: userId,
    title: firstText.slice(0, 70),
    status: 'active',
    state: '{}',
    created_at: timestamp,
    updated_at: timestamp,
  };
  await db.query(
    `INSERT INTO agent_sessions (id, user_id, title, status, state, created_at, updated_at) VALUES (?, ?, ?, 'active', '{}', ?, ?)`,
    [session.id, userId, session.title, timestamp, timestamp],
  );
  return session;
}

async function loadHistory(sessionId: string, excludeMessageId: string) {
  const rows = await db.query<{ id: string; role: string; content: string }>(
    `SELECT id, role, content FROM agent_messages WHERE session_id = ? AND id != ? ORDER BY created_at DESC LIMIT 10`,
    [sessionId, excludeMessageId],
  );
  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .reverse()
    .map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content }));
}

export async function runAgentTurn(opts: {
  userId: string;
  text: string;
  sessionId?: string | null;
  emit?: (event: AgentEvent) => void;
}): Promise<AgentTurnResult> {
  const emit = opts.emit ?? (() => undefined);
  const session = await ensureSession(opts.userId, opts.sessionId, opts.text);
  const state = parseJson<AgentState>(session.state, { turns: 0 });
  state.turns = (state.turns ?? 0) + 1;

  const messageId = newId();
  await db.query(
    `INSERT INTO agent_messages (id, session_id, role, content, tool_calls, created_at) VALUES (?, ?, 'user', ?, '[]', ?)`,
    [messageId, session.id, opts.text, nowIso()],
  );

  const history = await loadHistory(session.id, messageId);
  const memory = await getSessionUserMemory(opts.userId);

  const executions: ToolLogEntry[] = [];
  let step = 0;
  const toolTrace: string[] = [];

  const deps: AgentDeps = {
    userId: opts.userId,
    sessionId: session.id,
    state,
    memory,
    emit,
    async executeTool(name, input) {
      step += 1;
      if (step > MAX_TOOL_CALLS_PER_TURN) {
        return { ok: false, error: `Tool limit of ${MAX_TOOL_CALLS_PER_TURN} reached for this turn`, durationMs: 0 };
      }
      const label = stepLabel(name);
      emit({ type: 'tool_start', step, tool: name, label });
      const started = Date.now();
      const result = await executeTool(name, input, { userId: opts.userId, sessionId: session.id });
      const durationMs = Date.now() - started;

      // Remember the shortlist so "choose 2" resolves for every provider, not just the planner.
      if (name === 'search_products' && result.ok) {
        const output = result.output as { query?: string; products?: Array<{ id: string; name: string; priceCents: number }> };
        const products = output?.products ?? [];
        state.lastSearch = {
          query: output?.query ?? '',
          ids: products.map((product) => product.id),
          at: nowIso(),
          results: products.map((product) => ({ id: product.id, name: product.name, priceCents: product.priceCents })),
        };
      }
      const entry = await logToolExecution({
        sessionId: session.id,
        step,
        tool: name,
        label,
        input,
        output: result.output ?? {},
        status: result.ok ? 'ok' : 'error',
        error: result.error,
        durationMs,
      });
      executions.push(entry);
      toolTrace.push(`${name}: ${result.ok ? 'ok' : `error(${result.error})`}`);
      emit({
        type: 'tool_result',
        step,
        tool: name,
        label,
        status: result.ok ? 'ok' : 'error',
        durationMs,
        summary: summarizeToolResult(name, result.output, result.ok, result.error),
        error: result.error,
      });
      return { ...result, durationMs };
    },
  };

  const providers = createProviders();
  let provider = providers[0];
  let reply = '';

  for (const candidate of providers) {
    provider = candidate;
    try {
      const outcome = await candidate.run(deps, opts.text, history);
      reply = outcome.reply.trim();
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'model call failed';
      console.error(`[agent] ${candidate.name} failed:`, message.slice(0, 220));
      // A tool already wrote data this turn; retrying elsewhere could duplicate cart writes.
      if (executions.length > 0) {
        reply = 'The assistant stopped before finishing that step. Nothing was charged. Try again, or review the cart directly.';
        break;
      }
      if (candidate.name !== 'heuristic') {
        emit({ type: 'status', message: 'That model is unreachable, so the next provider is taking this turn' });
      }
    }
  }

  if (!reply) reply = 'I did not reach an answer that turn. Nothing was charged. Try rephrasing the request.';

  await db.query(
    `INSERT INTO agent_messages (id, session_id, role, content, tool_calls, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
    [newId(), session.id, reply, JSON.stringify(executions.map((entry) => ({ tool: entry.tool, status: entry.status }))), nowIso()],
  );
  await db.query(`UPDATE agent_sessions SET state = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(state),
    nowIso(),
    session.id,
  ]);

  const cart = await readCart(opts.userId);
  const approvalRow = await db.one<{ id: string; total_cents: number }>(
    `SELECT id, total_cents FROM orders WHERE user_id = ? AND status = 'awaiting_approval' ORDER BY created_at DESC LIMIT 1`,
    [opts.userId],
  );

  emit({ type: 'message', content: reply });
  emit({ type: 'done', sessionId: session.id });

  return {
    sessionId: session.id,
    reply,
    provider: provider.name,
    model: provider.model,
    executions,
    cart,
    approval: approvalRow ? { orderId: approvalRow.id, totalCents: Number(approvalRow.total_cents) } : null,
  };
}

export function agentRuntimeInfo() {
  const provider = activeAiProvider();
  return {
    provider,
    model: defaultModel(provider),
    live: provider !== 'heuristic',
    fallback: provider === 'heuristic',
    maxToolCalls: MAX_TOOL_CALLS_PER_TURN,
    sessionSecretSet: Boolean(env.sessionSecret),
    randomId: randomUUID().length,
  };
}
