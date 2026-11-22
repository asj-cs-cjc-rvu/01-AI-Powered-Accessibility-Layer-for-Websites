import path from 'node:path';
import dotenv from 'dotenv';

export type ProviderName = 'groq' | 'mock';
export const SUPPORTED_PROVIDERS: readonly ProviderName[] = ['groq', 'mock'];

export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'ConfigError'; }
}

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  allowedOrigins: string[];
  ai: {
    provider: ProviderName;
    groqApiKey: string;
    groqModel: string;
    groqBaseUrl: string;
    timeoutMs: number;
    maxRetries: number;
  };
}

function intEnv(raw: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new ConfigError(`${name} must be an integer.`);
  if (n < min || n > max) throw new ConfigError(`${name} must be between ${min} and ${max}.`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const providerRaw = (env.AI_PROVIDER ?? 'groq').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(providerRaw as ProviderName)) {
    throw new ConfigError(`AI_PROVIDER "${providerRaw}" is not supported. Use: ${SUPPORTED_PROVIDERS.join(', ')}.`);
  }
  const provider = providerRaw as ProviderName;

  const groqApiKey = (env.GROQ_API_KEY ?? '').trim();
  if (provider === 'groq' && groqApiKey.length === 0) {
    throw new ConfigError('GROQ_API_KEY is required when AI_PROVIDER=groq. Set it in the repository-root .env, or use AI_PROVIDER=mock for offline development.');
  }

  const groqModel = (env.GROQ_MODEL ?? 'qwen/qwen3.8-27b').trim();
  if (provider === 'groq' && groqModel.length === 0) throw new ConfigError('GROQ_MODEL must not be empty.');

  return {
    port: intEnv(env.PORT, 3000, 'PORT', 1, 65535),
    host: (env.HOST ?? '0.0.0.0').trim() || '0.0.0.0',
    nodeEnv: (env.NODE_ENV ?? 'development').trim(),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    ai: {
      provider,
      groqApiKey,
      groqModel,
      groqBaseUrl: (env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, ''),
      timeoutMs: intEnv(env.AI_TIMEOUT_MS, 30000, 'AI_TIMEOUT_MS', 1000, 120000),
      maxRetries: intEnv(env.AI_MAX_RETRIES, 1, 'AI_MAX_RETRIES', 0, 3),
    },
  };
}

export function loadDotenv(): void {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

/** Safe to log or serve over HTTP. Emits a boolean, never the key value. */
export function describeConfig(c: AppConfig) {
  return {
    provider: c.ai.provider,
    model: c.ai.provider === 'groq' ? c.ai.groqModel : null,
    timeoutMs: c.ai.timeoutMs,
    maxRetries: c.ai.maxRetries,
    // Only meaningful for the provider actually in use.
    credentialsPresent: c.ai.provider === 'groq' ? c.ai.groqApiKey.length > 0 : false,
  };
}