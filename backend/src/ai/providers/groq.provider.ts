import type { ProcessResult } from '@studylens/shared';
import { DEFAULT_LANGUAGE } from '@studylens/shared';
import type { AiProvider, ProviderRequest } from '../provider.interface';
import { ProviderError } from '../errors/provider.errors';
import { buildPrompt } from '../prompts';
import { parseAndValidate } from '../validation/result.validation';

export interface GroqOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
}

export class GroqProvider implements AiProvider {
  readonly name = 'groq';
  readonly model: string;
  private readonly o: GroqOptions;
  private readonly doFetch: typeof fetch;

  constructor(o: GroqOptions) {
    if (!o.apiKey) throw new ProviderError('CONFIGURATION');
    if (!o.model) throw new ProviderError('CONFIGURATION');
    this.o = o;
    this.model = o.model;
    this.doFetch = o.fetchImpl ?? fetch;
  }

  async complete(req: ProviderRequest): Promise<ProcessResult> {
    let last: ProviderError | undefined;
    for (let attempt = 0; attempt <= this.o.maxRetries; attempt += 1) {
      try {
        return await this.once(req);
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError('NETWORK');
        if (!err.retryable || attempt === this.o.maxRetries) throw err;
        last = err;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw last ?? new ProviderError('SERVER');
  }

  private async once(req: ProviderRequest): Promise<ProcessResult> {
    const language = req.targetLanguage ?? DEFAULT_LANGUAGE;
    const prompt = buildPrompt(req.action, req.text, language);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.o.timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(`${this.o.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.o.apiKey}`,
        },
        body: JSON.stringify({
          model: this.o.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_completion_tokens: 2048,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      throw (e as Error)?.name === 'AbortError'
        ? new ProviderError('TIMEOUT')
        : new ProviderError('NETWORK');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) throw new ProviderError('AUTH', res.status);
    if (res.status === 429) throw new ProviderError('RATE_LIMIT', res.status);
    if (res.status >= 500) throw new ProviderError('SERVER', res.status);
    if (!res.ok) throw new ProviderError('SERVER', res.status);

    let payload: ChatCompletion;
    try {
      payload = (await res.json()) as ChatCompletion;
    } catch {
      throw new ProviderError('MALFORMED');
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new ProviderError('MALFORMED');
    }
    return parseAndValidate(content, language);
  }
}