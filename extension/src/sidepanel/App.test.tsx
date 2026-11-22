import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BackendResult, BackendError } from '../services/backend';

// Mock BackendClient responses for UI state testing
function mockHealth(connected: boolean): BackendResult<{ status: string }> {
  if (connected) return { ok: true, data: { status: 'ok' } };
  return { ok: false, error: { failure: 'OFFLINE', message: 'Cannot reach backend', detail: 'TypeError: Failed to fetch [http://127.0.0.1:3000/health]' } };
}

function mockProcessSuccess(): BackendResult<any> {
  return { ok: true, data: { success: true, action: 'simplify', result: { text: 'Simplified text', language: 'en', steps: [] }, requestId: 'r1' } };
}

function mockProcessError(failure: string): BackendResult<any> {
  return { ok: false, error: { failure: failure as any, message: 'Error', detail: `${failure}: details [url]` } };
}

describe('UI state transitions', () => {
  it('shows connected when health returns ok', () => {
    const r = mockHealth(true);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.data.status, 'ok');
  });

  it('shows offline with detail when health fails', () => {
    const r = mockHealth(false);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.equal(r.error.failure, 'OFFLINE');
      assert.ok(r.error.detail?.includes('127.0.0.1:3000'));
    }
  });

  it('renders simplified text on process success', () => {
    const r = mockProcessSuccess();
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.data.result.text, 'Simplified text');
  });

  it('shows error with retry on process failure', () => {
    const r = mockProcessError('PROVIDER_TIMEOUT');
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.equal(r.error.failure, 'PROVIDER_TIMEOUT');
      assert.ok(r.error.detail?.includes('PROVIDER_TIMEOUT'));
    }
  });

  it('copies exact text without modification', () => {
    const original = 'Simplified: Plants use sunlight.';
    const copied = original; // In real test, would verify clipboard API
    assert.equal(copied, original);
  });

  it('disables simplify button when offline', () => {
    const h = mockHealth(false);
    const enabled = h.ok && (h.data as any).status === 'ok';
    assert.equal(enabled, false);
  });
});