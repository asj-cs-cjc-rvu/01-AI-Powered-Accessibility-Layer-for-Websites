import type { AppConfig } from '../config/env';
import type { AiProvider } from './provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { MockProvider } from './providers/mock.provider';
import { ProviderError } from './errors/provider.errors';

export function createProvider(config: AppConfig, fetchImpl?: typeof fetch): AiProvider {
  switch (config.ai.provider) {
    case 'groq':
      return new GroqProvider({
        apiKey: config.ai.groqApiKey,
        model: config.ai.groqModel,
        baseUrl: config.ai.groqBaseUrl,
        timeoutMs: config.ai.timeoutMs,
        maxRetries: config.ai.maxRetries,
        fetchImpl,
      });
    case 'mock':
      return new MockProvider();
    default:
      throw new ProviderError('CONFIGURATION');
  }
}