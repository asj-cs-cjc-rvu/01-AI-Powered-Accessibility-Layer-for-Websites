import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateResult, parseAndValidate, MAX_OUTPUT_CHARS, MAX_STEPS, MAX_CAVEATS } from '../src/ai/validation/result.validation';
import { DEFAULT_LANGUAGE } from '@studylens/shared';

describe('output validation', () => {
  it('accepts valid minimal shape', () => {
    const r = validateResult({ text: 'Hello' }, DEFAULT_LANGUAGE);
    assert.equal(r.text, 'Hello');
    assert.deepEqual(r.steps, []);
    assert.equal(r.caveats, undefined);
  });

  it('strips HTML tags from text', () => {
    const r = validateResult({ text: '<b>Bold</b> text <script>alert(1)</script>' }, DEFAULT_LANGUAGE);
    assert.equal(r.text, 'Bold text alert(1)');
  });

  it('removes fenced code blocks', () => {
    const r = validateResult({ text: 'Before ```code block``` after' }, DEFAULT_LANGUAGE);
    assert.equal(r.text, 'Before  after');
  });

  it('caps text at MAX_OUTPUT_CHARS and adds caveat', () => {
    const long = 'a'.repeat(MAX_OUTPUT_CHARS + 100);
    const r = validateResult({ text: long }, DEFAULT_LANGUAGE);
    assert.equal(r.text.length, MAX_OUTPUT_CHARS);
    assert.ok(r.caveats?.some((c: string) => c.includes('shortened')));
  });

  it('bounds steps array to MAX_STEPS', () => {
    const steps = Array.from({ length: MAX_STEPS + 5 }, (_, i) => `Step ${i}`);
    const r = validateResult({ text: 'Hi', steps }, DEFAULT_LANGUAGE);
    assert.equal(r.steps.length, MAX_STEPS);
  });

  it('bounds caveats array to MAX_CAVEATS', () => {
    const caveats = Array.from({ length: MAX_CAVEATS + 3 }, (_, i) => `Caveat ${i}`);
    const r = validateResult({ text: 'Hi', caveats }, DEFAULT_LANGUAGE);
    assert.equal(r.caveats?.length, MAX_CAVEATS);
  });

  it('filters non-string items from steps', () => {
    const r = validateResult({ text: 'Hi', steps: [1, null, 'valid', undefined, 'also valid'] }, DEFAULT_LANGUAGE);
    assert.deepEqual(r.steps, ['valid', 'also valid']);
  });

  it('rejects empty text after stripping', () => {
    assert.throws(() => validateResult({ text: '<b></b>' }, DEFAULT_LANGUAGE));
  });

  it('rejects non-object input', () => {
    assert.throws(() => validateResult(null, DEFAULT_LANGUAGE));
    assert.throws(() => validateResult([], DEFAULT_LANGUAGE));
    assert.throws(() => validateResult('string', DEFAULT_LANGUAGE));
  });

  it('rejects missing text field', () => {
    assert.throws(() => validateResult({ steps: [] }, DEFAULT_LANGUAGE));
  });

  it('parseAndValidate wraps JSON errors', () => {
    assert.throws(() => parseAndValidate('not json', DEFAULT_LANGUAGE));
  });

  it('preserves language from input', () => {
    const r = validateResult({ text: 'Hola' }, 'hi'); // Use 'hi' (Hindi) instead of 'es'
    assert.equal(r.language, 'hi');
  });
});