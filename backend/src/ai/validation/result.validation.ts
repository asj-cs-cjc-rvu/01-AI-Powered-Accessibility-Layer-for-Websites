import type { ProcessResult, Language } from '@studylens/shared';
import { ProviderError } from '../errors/provider.errors';

export const MAX_OUTPUT_CHARS = 12000;
export const MAX_STEPS = 20;
export const MAX_CAVEATS = 10;
export const MAX_ITEM_CHARS = 500;

/** Strip anything that could be read as markup. Output is rendered as plain text only. */
export function toPlainText(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

function cleanList(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map(toPlainText)
    .filter((x) => x.length > 0)
    .slice(0, maxItems)
    .map((x) => (x.length > MAX_ITEM_CHARS ? x.slice(0, MAX_ITEM_CHARS) : x));
}

/** Validate and normalize raw model JSON into the shared ProcessResult. */
export function validateResult(raw: unknown, language: Language): ProcessResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProviderError('MALFORMED');
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.text !== 'string') throw new ProviderError('MALFORMED');

  const text = toPlainText(p.text);
  if (text.length === 0) throw new ProviderError('MALFORMED');

  const truncated = text.length > MAX_OUTPUT_CHARS;
  const finalText = truncated ? text.slice(0, MAX_OUTPUT_CHARS) : text;

  const steps = cleanList(p.steps, MAX_STEPS);
  const caveats = cleanList(p.caveats, MAX_CAVEATS);
  if (truncated) caveats.push('The response was shortened because it exceeded the length limit.');

  return {
    text: finalText,
    language,
    steps,
    ...(caveats.length > 0 ? { caveats: caveats.slice(0, MAX_CAVEATS) } : {}),
  };
}

/** Parse then validate. Keeps JSON.parse failures inside the same error class. */
export function parseAndValidate(content: string, language: Language): ProcessResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ProviderError('MALFORMED');
  }
  return validateResult(parsed, language);
}