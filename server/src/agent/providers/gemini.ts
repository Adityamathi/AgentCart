import { env, defaultModel } from '../../env.js';
import { TOOLS } from '../tools.js';
import { systemPrompt } from '../prompt.js';
import type { AgentDeps, AgentHistoryMessage, AgentProvider } from '../types.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Google retires model names without warning: a key can list a model and still
 * answer 404 "no longer available to new users". These are the current Flash
 * names, tried in order when the configured one is gone.
 */
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.7-flash'];

/** Once a model answers, try it first next time instead of re-probing retired names. */
let lastWorkingModel: string | null = null;

class ModelUnavailable extends Error {
  constructor(model: string, detail: string) {
    super(`Gemini model "${model}" is unavailable: ${detail}`);
  }
}

type Part = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  /** Gemini 3.x requires this to be echoed back verbatim on the next round. */
  thoughtSignature?: string;
};
type Content = { role: 'user' | 'model'; parts: Part[] };

function toContents(history: AgentHistoryMessage[], userText: string): Content[] {
  const contents: Content[] = history.slice(-6).map((message) => ({
    role: message.role === 'user' ? 'user' : 'model',
    parts: [{ text: message.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: userText }] });
  return contents;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiProvider implements AgentProvider {
  name = 'gemini' as const;
  model = defaultModel('gemini');

  async run(deps: AgentDeps, userText: string, history: AgentHistoryMessage[]): Promise<{ reply: string }> {
    const candidates = [lastWorkingModel ?? this.model, this.model, ...FALLBACK_MODELS].filter(
      (model, index, all) => Boolean(model) && all.indexOf(model) === index,
    );
    let unavailable: ModelUnavailable | null = null;

    for (const model of candidates) {
      // Report the model actually in play, including when this attempt fails.
      this.model = model;
      try {
        const reply = await this.runWithModel(model, deps, userText, history);
        lastWorkingModel = model;
        return reply;
      } catch (error) {
        if (!(error instanceof ModelUnavailable)) throw error;
        unavailable = error;
        console.error('[agent] gemini model unavailable, trying the next one:', error.message.slice(0, 200));
      }
    }

    throw unavailable ?? new Error('No Gemini model was available');
  }

  private async runWithModel(
    model: string,
    deps: AgentDeps,
    userText: string,
    history: AgentHistoryMessage[],
  ): Promise<{ reply: string }> {
    const contents = toContents(history, userText);
    const declarations = TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    for (let round = 0; round < 6; round += 1) {
      const response = await this.request(model, {
        systemInstruction: { parts: [{ text: systemPrompt({ memory: deps.memory, state: deps.state }) }] },
        contents,
        tools: [{ functionDeclarations: declarations }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
      });

      // 404 = retired name, 429/503 = this model is shedding load. Either way,
      // another Flash model is more likely to answer than the local planner.
      if (response.status === 404 || response.status === 429 || response.status === 503) {
        throw new ModelUnavailable(model, `HTTP ${response.status} ${response.body.slice(0, 160)}`);
      }
      if (!response.ok) {
        throw new Error(`Gemini returned ${response.status}: ${response.body.slice(0, 240)}`);
      }

      const data = JSON.parse(response.body) as {
        candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
        promptFeedback?: { blockReason?: string };
      };

      if (data.promptFeedback?.blockReason) {
        return { reply: 'The model declined this request. Rephrase it as a product question and I will search the catalogue.' };
      }

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((part) => part.functionCall?.name);
      const text = parts
        .map((part) => part.text ?? '')
        .join('\n')
        .trim();

      if (calls.length === 0) {
        return { reply: text || 'I could not form an answer from the catalogue. Ask me for a product and a budget.' };
      }

      // Keep the model's own parts: they carry thoughtSignature, which the API
      // rejects as missing (400) if the function call is rebuilt from scratch.
      contents.push({ role: 'model', parts: calls });

      const responseParts: Part[] = [];
      for (const call of calls) {
        const result = await deps.executeTool(call.functionCall!.name, call.functionCall!.args ?? {});
        const payload: Record<string, unknown> = result.ok
          ? { result: result.output ?? {}, status: 'ok' }
          : { error: result.error ?? 'Tool failed', status: 'error' };
        responseParts.push({
          functionResponse: { name: call.functionCall!.name, response: payload },
        } as Part);
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    return { reply: 'I stopped after several tool steps without reaching a recommendation. Ask me to narrow the search.' };
  }

  /** One retry for 429/503: Google's free tier sheds load and recovers quickly. */
  private async request(
    model: string,
    body: unknown,
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const send = async () => {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    };

    let result = await send();
    if (result.status === 429 || result.status === 503) {
      await sleep(1_500);
      result = await send();
    }
    return result;
  }
}
