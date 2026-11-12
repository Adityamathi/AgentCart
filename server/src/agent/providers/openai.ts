import { env, defaultModel } from '../../env.js';
import { TOOLS } from '../tools.js';
import { systemPrompt } from '../prompt.js';
import type { AgentDeps, AgentHistoryMessage, AgentProvider } from '../types.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface OpenAICompatibleOptions {
  name: 'openai' | 'groq';
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** OpenAI chat-completions provider. Groq uses the same wire format. */
export class OpenAIProvider implements AgentProvider {
  name: 'openai' | 'groq' = 'openai';
  model = defaultModel('openai');
  private baseUrl = env.openaiBaseUrl;
  private apiKey = env.openaiKey;

  constructor(options: Partial<OpenAICompatibleOptions> = {}) {
    if (options.name) this.name = options.name;
    if (options.baseUrl) this.baseUrl = options.baseUrl;
    if (options.apiKey) this.apiKey = options.apiKey;
    if (options.model) this.model = options.model;
  }

  async run(deps: AgentDeps, userText: string, history: AgentHistoryMessage[]): Promise<{ reply: string }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt({ memory: deps.memory, state: deps.state }) },
      ...history.slice(-6).map((message) => ({ role: message.role, content: message.content }) as ChatMessage),
      { role: 'user', content: userText },
    ];

    for (let round = 0; round < 6; round += 1) {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
          max_tokens: 900,
          tools: TOOLS.map((tool) => ({
            type: 'function',
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
        }),
        signal: AbortSignal.timeout(60_000),
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(`${this.name} returned ${response.status}: ${body.slice(0, 240)}`);
      }
      const data = JSON.parse(body) as {
        choices?: Array<{ message?: ChatMessage }>;
      };
      const message = data.choices?.[0]?.message;
      if (!message) return { reply: 'The model returned an empty response. Try again.' };

      if (!message.tool_calls?.length) {
        return { reply: message.content?.trim() || 'I could not form an answer from the catalogue.' };
      }

      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }
        const result = await deps.executeTool(call.function.name, args);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? { status: 'ok', result: result.output } : { status: 'error', error: result.error }),
        });
      }
    }

    return { reply: 'I stopped after several tool steps without reaching a recommendation. Ask me to narrow the search.' };
  }
}
