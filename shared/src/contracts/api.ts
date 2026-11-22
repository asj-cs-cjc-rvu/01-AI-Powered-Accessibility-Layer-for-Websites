// ── Actions ──────────────────────────────────────────────────────
export type Action = 'simplify' | 'explain' | 'translate' | 'steps';
export const VALID_ACTIONS: readonly Action[] = ['simplify', 'explain', 'translate', 'steps'];

export function isValidAction(v: unknown): v is Action {
  return typeof v === 'string' && (VALID_ACTIONS as readonly string[]).includes(v);
}

// ── Languages ────────────────────────────────────────────────────
export type Language = 'en' | 'hi' | 'kn';
export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'hi', 'kn'];
export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'हिन्दी',
  kn: 'ಕನ್ನಡ',
};

export function isValidLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

// ── Limits ───────────────────────────────────────────────────────
export const MAX_TEXT_LENGTH = 5000;
export const MAX_BODY_BYTES = 64 * 1024;

// ── Paths ────────────────────────────────────────────────────────
export const HEALTH_PATH = '/health';
export const API_PROCESS_PATH = '/api/v1/process';

// ── Errors ───────────────────────────────────────────────────────
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'TEXT_TOO_LONG'
  | 'UNSUPPORTED_LANGUAGE'
  | 'INTERNAL_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED';

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  TEXT_TOO_LONG: 413,
  UNSUPPORTED_LANGUAGE: 400,
  INTERNAL_ERROR: 500,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
};

export const ERROR_CODES: readonly ErrorCode[] = Object.keys(ERROR_HTTP_STATUS) as ErrorCode[];

// ── Request ──────────────────────────────────────────────────────
export interface ProcessSource {
  type: 'selection';
  url?: string;
  pageTitle?: string;
  truncated?: boolean;
}

export interface ProcessRequest {
  action: Action;
  text: string;
  source: ProcessSource;
  targetLanguage?: Language;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string };

export function validateProcessRequest(body: unknown): ValidationResult<ProcessRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  if (!isValidAction(b.action)) {
    return { ok: false, code: 'INVALID_INPUT', message: `Invalid or missing action. Must be one of: ${VALID_ACTIONS.join(', ')}.` };
  }
  const action = b.action;

  if (typeof b.text !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', message: 'text must be a string.' };
  }
  const trimmed = b.text.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: 'INVALID_INPUT', message: 'text must not be empty or whitespace-only.' };
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return { ok: false, code: 'TEXT_TOO_LONG', message: `Text exceeds the ${MAX_TEXT_LENGTH}-character limit.` };
  }

  if (typeof b.source !== 'object' || b.source === null || Array.isArray(b.source)) {
    return { ok: false, code: 'INVALID_INPUT', message: 'source must be an object.' };
  }
  const src = b.source as Record<string, unknown>;
  if (src.type !== 'selection') {
    return { ok: false, code: 'INVALID_INPUT', message: 'source.type must be "selection".' };
  }
  const source: ProcessSource = { type: 'selection' };
  if (typeof src.url === 'string') source.url = src.url;
  if (typeof src.pageTitle === 'string') source.pageTitle = src.pageTitle;
  if (typeof src.truncated === 'boolean') source.truncated = src.truncated;

  let targetLanguage: Language | undefined;
  if (b.targetLanguage !== undefined) {
    if (!isValidLanguage(b.targetLanguage)) {
      return { ok: false, code: 'UNSUPPORTED_LANGUAGE', message: `Unsupported language "${String(b.targetLanguage)}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.` };
    }
    targetLanguage = b.targetLanguage;
  }
  if (action === 'translate' && targetLanguage === undefined) {
    return { ok: false, code: 'INVALID_INPUT', message: 'targetLanguage is required for translate action.' };
  }

  const value: ProcessRequest = { action, text: trimmed, source };
  if (targetLanguage !== undefined) value.targetLanguage = targetLanguage;
  return { ok: true, value };
}

// ── Response ─────────────────────────────────────────────────────
export interface ProcessResult {
  text: string;
  language: Language;
  steps: string[];
  caveats?: string[];
}

export interface ProcessSuccessResponse {
  success: true;
  action: Action;
  result: ProcessResult;
  requestId: string;
}

export interface ProcessErrorResponse {
  success: false;
  error: { code: ErrorCode; message: string };
  requestId: string;
}

export type ProcessResponse = ProcessSuccessResponse | ProcessErrorResponse;

// ── Health ───────────────────────────────────────────────────────
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}