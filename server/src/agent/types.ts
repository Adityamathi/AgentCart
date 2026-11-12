export interface AgentState {
  lastSearch?: {
    query: string;
    ids: string[];
    at: string;
    results?: Array<{ id: string; name: string; priceCents: number }>;
  };
  lastComparison?: string[];
  requirements?: string[];
  budgetCents?: number | null;
  preparedOrderId?: string;
  turns: number;
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'tool_start'; step: number; tool: string; label: string }
  | {
      type: 'tool_result';
      step: number;
      tool: string;
      label: string;
      status: 'ok' | 'error';
      durationMs: number;
      summary: string;
      error?: string;
    }
  | { type: 'message'; content: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string };

export interface ToolRunResult {
  ok: boolean;
  output?: any;
  error?: string;
  durationMs: number;
}

export interface AgentDeps {
  userId: string;
  sessionId: string;
  state: AgentState;
  memory: string[];
  executeTool: (name: string, input: unknown) => Promise<ToolRunResult>;
  emit: (event: AgentEvent) => void;
}

export interface AgentProvider {
  name: 'gemini' | 'openai' | 'groq' | 'heuristic';
  model: string;
  run(deps: AgentDeps, userText: string, history: AgentHistoryMessage[]): Promise<{ reply: string }>;
}
