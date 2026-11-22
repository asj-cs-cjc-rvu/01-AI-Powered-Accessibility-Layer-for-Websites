import type { SourceInfo } from '@studylens/shared';

// Literal values (not imported constants) so the content script can compare
// message types without pulling in any runtime module.
export const REQUEST_SELECTION = 'REQUEST_SELECTION';
export const CAPTURE_SELECTION = 'CAPTURE_SELECTION';
export const SELECTION_RESULT = 'SELECTION_RESULT';

export interface CapturedSelection {
  text: string;
  source: SourceInfo;
}

export type CaptureFailureReason =
  | 'NO_SELECTION'
  | 'UNSUPPORTED_PAGE'
  | 'NO_ACTIVE_TAB'
  | 'INJECTION_FAILED';

export type CaptureResponse =
  | { success: true; payload: CapturedSelection }
  | { success: false; reason: 'NO_SELECTION' };

export type SelectionResponse =
  | { success: true; payload: CapturedSelection }
  | { success: false; reason: CaptureFailureReason; message: string };

export function isRequestSelectionMessage(value: unknown): value is { type: typeof REQUEST_SELECTION } {
  return typeof value === 'object' && value !== null &&
    (value as { type?: unknown }).type === REQUEST_SELECTION;
}

export function isCaptureSelectionMessage(value: unknown): value is { type: typeof CAPTURE_SELECTION } {
  return typeof value === 'object' && value !== null &&
    (value as { type?: unknown }).type === CAPTURE_SELECTION;
}

export function isCapturedSelection(value: unknown): value is CapturedSelection {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== 'string' || v.text.trim().length === 0) return false;
  const s = v.source as Record<string, unknown> | undefined;
  if (typeof s !== 'object' || s === null) return false;
  return s.type === 'selection';
}

export function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

// New message types for Phase 3 Simplify workflow
export const SIMPLIFY_REQUEST = 'SIMPLIFY_REQUEST';
export const SIMPLIFY_SUCCESS = 'SIMPLIFY_SUCCESS';
export const SIMPLIFY_ERROR = 'SIMPLIFY_ERROR';
export const BACKEND_HEALTH_CHECK = 'BACKEND_HEALTH_CHECK';
export const BACKEND_HEALTH_RESULT = 'BACKEND_HEALTH_RESULT';

export type BackendHealthStatus = 'checking' | 'connected' | 'offline';

export interface SimplifyState {
  status: 'idle' | 'loading' | 'success' | 'error';
  simplifiedText?: string;
  errorMessage?: string;
}