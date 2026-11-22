import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TEXT_LENGTH, ERROR_CODES, ERROR_HTTP_STATUS, validateProcessRequest } from '../contracts/api';

const sel = { type: 'selection' } as const;

describe('shared API contract', () => {
  it('simplify: valid request accepted and text trimmed', () => {
    const r = validateProcessRequest({ action: 'simplify', text: '  Plants make food.  ', source: sel });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.action, 'simplify');
      assert.equal(r.value.text, 'Plants make food.');
    }
  });

  it('explain: valid request accepted', () => {
    const r = validateProcessRequest({ action: 'explain', text: 'What is ATP?', source: sel });
    assert.ok(r.ok);
  });

  it('steps: valid request accepted', () => {
    const r = validateProcessRequest({ action: 'steps', text: 'How to solve a linear equation', source: sel });
    assert.ok(r.ok);
  });

  it('translate: targetLanguage is required', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hello', source: sel });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
  });

  it('translate: en, hi, kn accepted', () => {
    for (const lang of ['en', 'hi', 'kn'] as const) {
      const r = validateProcessRequest({ action: 'translate', text: 'Hello', source: sel, targetLanguage: lang });
      assert.ok(r.ok, `language ${lang} should be accepted`);
    }
  });

  it('unsupported language returns UNSUPPORTED_LANGUAGE', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hello', source: sel, targetLanguage: 'fr' });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'UNSUPPORTED_LANGUAGE');
  });

  it('empty or whitespace-only text rejected', () => {
    for (const text of ['', '   ', '\n\t']) {
      const r = validateProcessRequest({ action: 'simplify', text, source: sel });
      assert.ok(!r.ok);
      if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
    }
  });

  it('invalid action rejected', () => {
    const r = validateProcessRequest({ action: 'summarize', text: 'Hello', source: sel });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
  });

  it('oversized text returns TEXT_TOO_LONG', () => {
    const r = validateProcessRequest({ action: 'simplify', text: 'a'.repeat(MAX_TEXT_LENGTH + 1), source: sel });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'TEXT_TOO_LONG');
  });

  it('text exactly at limit accepted', () => {
    const r = validateProcessRequest({ action: 'simplify', text: 'a'.repeat(MAX_TEXT_LENGTH), source: sel });
    assert.ok(r.ok);
  });

  it('missing or malformed source rejected', () => {
    const bodies = [
      { action: 'simplify', text: 'Hello' },
      { action: 'simplify', text: 'Hello', source: 'selection' },
      { action: 'simplify', text: 'Hello', source: [] },
      { action: 'simplify', text: 'Hello', source: { type: 'page' } },
    ];
    for (const b of bodies) {
      const r = validateProcessRequest(b);
      assert.ok(!r.ok);
      if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
    }
  });

  it('non-object bodies rejected', () => {
    for (const b of [null, [], 'text', 42, undefined]) {
      const r = validateProcessRequest(b);
      assert.ok(!r.ok);
      if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
    }
  });

  it('every error code has an HTTP status; INTERNAL_ERROR is 500', () => {
    for (const code of ERROR_CODES) assert.equal(typeof ERROR_HTTP_STATUS[code], 'number');
    assert.equal(ERROR_HTTP_STATUS.INTERNAL_ERROR, 500);
  });
});

describe('new actions and languages', () => {
  it('accepts explain action', () => {
    const r = validateProcessRequest({ action: 'explain', text: 'Hello', source: sel });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.value.action, 'explain');
  });

  it('accepts translate action with targetLanguage', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hello', source: sel, targetLanguage: 'hi' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.action, 'translate');
      assert.equal(r.value.targetLanguage, 'hi');
    }
  });

  it('rejects translate without targetLanguage', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hello', source: sel });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
  });

  it('accepts steps (Guide Me) action', () => {
    const r = validateProcessRequest({ action: 'steps', text: 'How plants grow', source: sel });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.value.action, 'steps');
  });

  it('accepts Hindi language code', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hi', source: sel, targetLanguage: 'hi' });
    assert.ok(r.ok);
  });

  it('accepts Kannada language code', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hi', source: sel, targetLanguage: 'kn' });
    assert.ok(r.ok);
  });

  it('rejects unsupported language', () => {
    const r = validateProcessRequest({ action: 'translate', text: 'Hi', source: sel, targetLanguage: 'fr' });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'UNSUPPORTED_LANGUAGE');
  });

  it('rejects unknown action', () => {
    const r = validateProcessRequest({ action: 'listen', text: 'Hi', source: sel });
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.code, 'INVALID_INPUT');
  });
});