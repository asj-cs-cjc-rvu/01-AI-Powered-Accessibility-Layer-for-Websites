import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BackendClient, isProcessResponse, isHealthResponse } from './backend';
import type { ProcessRequest } from '@studylens/shared';

const body: ProcessRequest = { action: 'simplify', text: 'Plants make food.', source: { type: 'selection' } };

function jsonFetch(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

describe('BackendClient', () => {
  it('returns health on success', async () => {
    const c = new BackendClient({ fetchImpl: jsonFetch({ status: 'ok', service: 'studylens-backend', version: '2.0.0', timestamp: 't' }) });
    const r = await c.health();
    assert.ok(r.ok);
    if (r.ok) assert.ok(isHealthResponse(r.data));
  });

  it('reports OFFLINE when fetch rejects', async () => {
    const failing = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const r = await new BackendClient({ fetchImpl: failing }).health();
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.error.failure, 'OFFLINE');
  });

  it('reports TIMEOUT on abort', async () => {
    const aborting = (async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }) as unknown as typeof fetch;
    const r = await new BackendClient({ fetchImpl: aborting }).health();
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.error.failure, 'TIMEOUT');
  });

  it('reports BAD_JSON on non-JSON body', async () => {
    const html = (async () => new Response('<html>nope</html>', { status: 200 })) as unknown as typeof fetch;
    const r = await new BackendClient({ fetchImpl: html }).health();
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.error.failure, 'BAD_JSON');
  });

  it('delivers a contract error body from a 500 response', async () => {
    const errBody = { success: false, error: { code: 'INTERNAL_ERROR', message: 'AI processing is not implemented yet.' }, requestId: 'r1' };
    const r = await new BackendClient({ fetchImpl: jsonFetch(errBody, 500) }).process(body);
    assert.ok(r.ok);
    if (r.ok) assert.ok(isProcessResponse(r.data));
  });

  it('reports HTTP_ERROR for non-contract error bodies', async () => {
    const r = await new BackendClient({ fetchImpl: jsonFetch({ weird: true }, 500) }).process(body);
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.error.failure, 'HTTP_ERROR');
  });

  it('never sends an Authorization header', async () => {
    let seen: HeadersInit | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      seen = init.headers;
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }) as unknown as typeof fetch;
    await new BackendClient({ fetchImpl: spy }).process(body);
    assert.ok(!JSON.stringify(seen ?? {}).toLowerCase().includes('authorization'));
  });

  it('strips trailing slash from base url', () => {
    assert.equal(new BackendClient({ baseUrl: 'http://localhost:3000/' }).baseUrl, 'http://localhost:3000');
  });
});

describe('response guards', () => {
  it('accepts success shape', () => assert.ok(isProcessResponse({ success: true, action: 'simplify', result: {} })));
  it('accepts error shape', () => assert.ok(isProcessResponse({ success: false, error: { code: 'INVALID_INPUT' } })));
  it('rejects junk', () => {
    for (const v of [null, undefined, {}, 'x', 42]) assert.equal(isProcessResponse(v), false);
  });
});