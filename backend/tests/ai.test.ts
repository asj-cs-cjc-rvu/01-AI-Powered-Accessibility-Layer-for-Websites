import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError, describeConfig } from '../src/config/env';
import { GroqProvider } from '../src/ai/providers/groq.provider';
import { parseAndValidate } from '../src/ai/validation/result.validation';
import { MockProvider } from '../src/ai/providers/mock.provider';
import { createProvider } from '../src/ai/provider.factory';
import { ProviderError } from '../src/ai/errors/provider.errors';
import type { ProviderRequest } from '../src/ai/provider.interface';

const baseEnv = { AI_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_test_key', GROQ_MODEL: 'qwen/qwen3.8-27b' };
const req: ProviderRequest = { action: 'simplify', text: 'Plants make food.', requestId: 'r1' };
const opts = { apiKey: 'k', model: 'm', baseUrl: 'https://api.groq.com/openai/v1', timeoutMs: 5000, maxRetries: 0 };

function okFetch(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}
function statusFetch(status: number): typeof fetch {
  return (async () => new Response('{"error":{"message":"secret detail"}}', { status })) as unknown as typeof fetch;
}
const goodBody = { choices: [{ message: { content: JSON.stringify({ text: 'Plants use sunlight to make food.', steps: [], caveats: [] }) } }] };

describe('config', () => {
  it('loads valid groq config', () => {
    const c = loadConfig(baseEnv as NodeJS.ProcessEnv);
    assert.equal(c.ai.provider, 'groq');
    assert.equal(c.ai.groqModel, 'qwen/qwen3.8-27b');
    assert.equal(c.ai.timeoutMs, 30000);
  });
  it('rejects missing api key', () => {
    assert.throws(() => loadConfig({ AI_PROVIDER: 'groq' } as NodeJS.ProcessEnv), ConfigError);
  });
  it('rejects invalid provider', () => {
    assert.throws(() => loadConfig({ AI_PROVIDER: 'openai' } as NodeJS.ProcessEnv), ConfigError);
  });
  it('allows mock without a key', () => {
    assert.equal(loadConfig({ AI_PROVIDER: 'mock' } as NodeJS.ProcessEnv).ai.provider, 'mock');
  });
  it('rejects bad timeout values', () => {
    assert.throws(() => loadConfig({ ...baseEnv, AI_TIMEOUT_MS: 'abc' } as NodeJS.ProcessEnv), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, AI_TIMEOUT_MS: '0' } as NodeJS.ProcessEnv), ConfigError);
  });
  it('never exposes the key value in describeConfig', () => {
    const d = describeConfig(loadConfig(baseEnv as NodeJS.ProcessEnv));
    assert.ok(!JSON.stringify(d).includes('gsk_test_key'));
    assert.equal(d.credentialsPresent, true);
  });
    it('reports no credentials for mock even if a key is set', () => {
    const d = describeConfig(loadConfig({ AI_PROVIDER: 'mock', GROQ_API_KEY: 'gsk_leftover' } as NodeJS.ProcessEnv));
    assert.equal(d.credentialsPresent, false);
    assert.ok(!JSON.stringify(d).includes('gsk_leftover'));
  });
});

describe('groq adapter', () => {
  it('returns normalized result on success', async () => {
    const p = new GroqProvider({ ...opts, fetchImpl: okFetch(goodBody) });
    const r = await p.complete(req);
    assert.equal(r.text, 'Plants use sunlight to make food.');
    assert.equal(r.language, 'en');
    assert.deepEqual(r.steps, []);
  });
  it('maps 401 to INTERNAL_ERROR and hides provider detail', async () => {
    const p = new GroqProvider({ ...opts, fetchImpl: statusFetch(401) });
    await assert.rejects(p.complete(req), (e: ProviderError) => {
      assert.equal(e.code, 'INTERNAL_ERROR');
      assert.ok(!e.message.includes('secret'));
      return true;
    });
  });
  it('maps 429 to RATE_LIMITED', async () => {
    const p = new GroqProvider({ ...opts, fetchImpl: statusFetch(429) });
    await assert.rejects(p.complete(req), (e: ProviderError) => e.code === 'RATE_LIMITED');
  });
  it('maps 500 to PROVIDER_ERROR', async () => {
    const p = new GroqProvider({ ...opts, fetchImpl: statusFetch(500) });
    await assert.rejects(p.complete(req), (e: ProviderError) => e.code === 'PROVIDER_ERROR');
  });
  it('maps abort to PROVIDER_TIMEOUT', async () => {
    const aborting = (async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }) as unknown as typeof fetch;
    const p = new GroqProvider({ ...opts, fetchImpl: aborting });
    await assert.rejects(p.complete(req), (e: ProviderError) => e.code === 'PROVIDER_TIMEOUT');
  });
  it('maps network failure to PROVIDER_ERROR', async () => {
    const failing = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const p = new GroqProvider({ ...opts, fetchImpl: failing });
    await assert.rejects(p.complete(req), (e: ProviderError) => e.code === 'PROVIDER_ERROR');
  });
  it('rejects empty model content', async () => {
    const p = new GroqProvider({ ...opts, fetchImpl: okFetch({ choices: [{ message: { content: '' } }] }) });
    await assert.rejects(p.complete(req), (e: ProviderError) => e.failure === 'MALFORMED');
  });
  it('rejects malformed json content', async () => {
    const p = new GroqProvider({ ...opts, fetchImpl: okFetch({ choices: [{ message: { content: 'not json' } }] }) });
    await assert.rejects(p.complete(req), (e: ProviderError) => e.failure === 'MALFORMED');
  });
  it('retries retryable failures up to maxRetries', async () => {
    let calls = 0;
    const counting = (async () => { calls += 1; return new Response('x', { status: 500 }); }) as unknown as typeof fetch;
    const p = new GroqProvider({ ...opts, maxRetries: 2, fetchImpl: counting });
    await assert.rejects(p.complete(req));
    assert.equal(calls, 3);
  });
  it('does not retry auth failures', async () => {
    let calls = 0;
    const counting = (async () => { calls += 1; return new Response('x', { status: 401 }); }) as unknown as typeof fetch;
    const p = new GroqProvider({ ...opts, maxRetries: 2, fetchImpl: counting });
    await assert.rejects(p.complete(req));
    assert.equal(calls, 1);
  });
  it('never puts the api key in the result', async () => {
    const p = new GroqProvider({ ...opts, apiKey: 'gsk_super_secret', fetchImpl: okFetch(goodBody) });
    assert.ok(!JSON.stringify(await p.complete(req)).includes('gsk_super_secret'));
  });
});

describe('validateResult', () => {
  it('accepts valid shape', () => assert.equal(parseAndValidate('{"text":"hi","steps":[]}', 'en').text, 'hi'));
  it('rejects array root', () => assert.throws(() => parseAndValidate('[]', 'en')));
  it('rejects missing text', () => assert.throws(() => parseAndValidate('{"steps":[]}', 'en')));
  it('filters non-string steps', () => assert.deepEqual(parseAndValidate('{"text":"hi","steps":[1,"a"]}', 'en').steps, ['a']));
});

describe('factory', () => {
  it('creates groq provider', () => assert.equal(createProvider(loadConfig(baseEnv as NodeJS.ProcessEnv)).name, 'groq'));
  it('creates mock provider', () => assert.equal(createProvider(loadConfig({ AI_PROVIDER: 'mock' } as NodeJS.ProcessEnv)).name, 'mock'));
  it('mock implements the same interface', async () => {
    const r = await new MockProvider().complete(req);
    assert.equal(typeof r.text, 'string');
    assert.ok(Array.isArray(r.steps));
  });
});