import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/http.js';
import { chatSchema } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { runAgentTurn } from '../agent/engine.js';
import { executeTool, TOOLS, stepLabel } from '../agent/tools.js';
import { db } from '../db/index.js';
import { parseJson } from '../lib/util.js';
import type { AgentEvent } from '../agent/types.js';

export const agentRouter = Router();

agentRouter.use(requireAuth);

agentRouter.get('/tools', (_req, res) => {
  res.json({
    tools: TOOLS.map((tool) => ({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters })),
  });
});

agentRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const body = chatSchema.parse(req.body);
    const wantsStream = req.query.stream === '1' || (req.get('accept') ?? '').includes('text/event-stream');

    if (!wantsStream) {
      res.setHeader('Cache-Control', 'private, no-store');
      const result = await runAgentTurn({ userId: req.user!.id, text: body.message, sessionId: body.sessionId });
      res.json(result);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: AgentEvent | { type: 'result'; result: unknown }) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    let closed = false;
    req.on('close', () => {
      closed = true;
    });
    try {
      send({ type: 'status', message: 'Reading your request' });
      const result = await runAgentTurn({
        userId: req.user!.id,
        text: body.message,
        sessionId: body.sessionId,
        emit: (event) => {
          if (!closed) send(event);
        },
      });
      if (!closed) send({ type: 'result', result });
    } catch (error) {
      if (!closed) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'The agent failed' });
      }
    } finally {
      res.end();
    }
  }),
);

const executeSchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.unknown()).optional(),
  sessionId: z.string().uuid().optional(),
});

agentRouter.post(
  '/execute',
  asyncHandler(async (req, res) => {
    const body = executeSchema.parse(req.body);
    if (!TOOLS.some((tool) => tool.name === body.tool)) {
      throw new HttpError(400, `Unknown tool "${body.tool}"`, 'unknown_tool');
    }
    const result = await executeTool(body.tool, body.input ?? {}, {
      userId: req.user!.id,
      sessionId: body.sessionId ?? 'manual',
    });
    res.status(result.ok ? 200 : 422).json({ tool: body.tool, label: stepLabel(body.tool), ...result });
  }),
);

agentRouter.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT e.*, s.title FROM agent_tool_executions e
       JOIN agent_sessions s ON s.id = e.session_id
       WHERE s.user_id = ? ORDER BY e.created_at DESC LIMIT 80`,
      [req.user!.id],
    );
    const sessions = await db.query(
      `SELECT id, title, created_at, updated_at, status FROM agent_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 12`,
      [req.user!.id],
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      executions: rows.map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        sessionTitle: row.title,
        step: row.step,
        tool: row.tool_name,
        label: stepLabel(row.tool_name),
        status: row.status,
        input: parseJson(row.input, {}),
        output: parseJson(row.output, {}),
        error: row.error,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      })),
      sessions,
    });
  }),
);

agentRouter.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const session = await db.one<{ id: string; title: string; user_id: string }>(
      `SELECT id, title, user_id FROM agent_sessions WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user!.id],
    );
    if (!session) throw new HttpError(404, 'Session not found', 'session_not_found');
    const messages = await db.query(
      `SELECT id, role, content, created_at FROM agent_messages WHERE session_id = ? ORDER BY created_at`,
      [session.id],
    );
    const executions = await db.query(
      `SELECT * FROM agent_tool_executions WHERE session_id = ? ORDER BY created_at`,
      [session.id],
    );
    res.json({ session, messages, executions });
  }),
);
