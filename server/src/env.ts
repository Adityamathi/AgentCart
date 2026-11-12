import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), 'server/.env'),
];

for (const file of candidates) {
  if (existsSync(file)) {
    dotenv.config({ path: file });
    break;
  }
}

function str(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  // Some sandboxes export PORT=0; a dynamic port is not useful for this app.
  port: int('PORT', 4000) || 4000,
  appOrigin: str('APP_ORIGIN', 'http://localhost:5173'),
  sessionSecret: str('SESSION_SECRET', 'agentcart-development-secret'),

  databaseUrl: str('DATABASE_URL'),
  sqlitePath: str('SQLITE_PATH'),

  aiProvider: str('AI_PROVIDER', 'auto').toLowerCase(),
  aiModel: str('AI_MODEL'),
  geminiKey: str('GEMINI_API_KEY', str('GOOGLE_API_KEY')),
  openaiKey: str('OPENAI_API_KEY'),
  openaiBaseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  // Groq speaks the OpenAI chat-completions dialect, so it reuses that provider.
  groqKey: str('GROQ_API_KEY'),
  groqBaseUrl: str('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
  groqModel: str('GROQ_MODEL', 'openai/gpt-oss-120b'),

  paypalClientId: str('PAYPAL_CLIENT_ID'),
  paypalClientSecret: str('PAYPAL_CLIENT_SECRET'),
  paypalBaseUrl: str('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com'),
  paypalWebhookId: str('PAYPAL_WEBHOOK_ID'),
  paypalCurrency: str('PAYPAL_CURRENCY', 'USD'),

  shippingFlatCents: int('SHIPPING_FLAT_CENTS', 0),
  taxRateBps: int('TAX_RATE_BPS', 0),

  demoEmail: str('DEMO_EMAIL', 'demo@agentcart.dev'),
  demoPassword: str('DEMO_PASSWORD', 'demo12345'),
};

export const paypalConfigured = Boolean(env.paypalClientId && env.paypalClientSecret);

export type AiProviderName = 'gemini' | 'openai' | 'groq';

/** Preference order used when AI_PROVIDER is `auto` or names a provider without a key. */
const PROVIDER_ORDER: AiProviderName[] = ['gemini', 'groq', 'openai'];

function hasKey(provider: AiProviderName): boolean {
  if (provider === 'gemini') return Boolean(env.geminiKey);
  if (provider === 'openai') return Boolean(env.openaiKey);
  return Boolean(env.groqKey);
}

/**
 * Ordered providers that actually have a key. The engine tries them in turn, so
 * a provider outage costs one failed request, not the whole turn.
 */
export function configuredProviders(): AiProviderName[] {
  if (env.aiProvider === 'heuristic') return [];
  const preferred = PROVIDER_ORDER.includes(env.aiProvider as AiProviderName)
    ? [env.aiProvider as AiProviderName]
    : [];
  return [...preferred, ...PROVIDER_ORDER.filter((name) => !preferred.includes(name))].filter(hasKey);
}

export function activeAiProvider(): AiProviderName | 'heuristic' {
  return configuredProviders()[0] ?? 'heuristic';
}

export function defaultModel(provider: AiProviderName | 'heuristic'): string {
  if (provider === 'groq') return env.groqModel;
  if (env.aiModel) return env.aiModel;
  // Google retires flash names without warning; 2.5-flash already 404s for new keys.
  if (provider === 'gemini') return 'gemini-3.5-flash';
  if (provider === 'openai') return 'gpt-4o-mini';
  return 'local-planner';
}

/** Safe, public view of which integrations are live. Never includes secrets. */
export function integrationStatus() {
  const provider = activeAiProvider();
  const chain = configuredProviders();
  return {
    ai: {
      provider,
      model: defaultModel(provider),
      live: provider !== 'heuristic',
      configured: provider !== 'heuristic',
      chain,
    },
    paypal: {
      configured: paypalConfigured,
      clientId: paypalConfigured ? env.paypalClientId : null,
      currency: env.paypalCurrency,
      environment: env.paypalBaseUrl.includes('sandbox') ? 'sandbox' : 'live',
      webhookConfigured: Boolean(env.paypalWebhookId),
    },
    database: {
      driver: env.databaseUrl ? 'postgres' : 'sqlite',
    },
  };
}
