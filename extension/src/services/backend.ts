import type { ProcessRequest, ProcessResponse, HealthResponse } from '@studylens/shared';
import { API_PROCESS_PATH, HEALTH_PATH } from '@studylens/shared';
import { DEFAULT_BACKEND_BASE_URL } from '../config/backend-url';

export { DEFAULT_BACKEND_BASE_URL };

export type BackendFailure = 'OFFLINE' | 'TIMEOUT' | 'BAD_JSON' | 'HTTP_ERROR';

export interface BackendError {
  failure: BackendFailure;
  message: string;
  detail?: string;
}

export type BackendResult<T> = { ok: true; data: T } | { ok: false; error: BackendError };

const MESSAGES: Record<BackendFailure, string> = {
  OFFLINE: 'Cannot reach the StudyLens backend.',
  TIMEOUT: 'The StudyLens backend took too long to respond.',
  BAD_JSON: 'The StudyLens backend returned an unreadable response.',
  HTTP_ERROR: 'The StudyLens backend returned an error.',
};

export interface ClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class BackendClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(o: ClientOptions = {}) {
    this.baseUrl = (o.baseUrl ?? DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = o.timeoutMs ?? 15000;
    // Native fetch requires Window/globalThis as its receiver.
    this.doFetch = o.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  health(): Promise<BackendResult<HealthResponse>> {
    return this.request<HealthResponse>(HEALTH_PATH, { method: 'GET' });
  }

  process(body: ProcessRequest): Promise<BackendResult<ProcessResponse>> {
    return this.request<ProcessResponse>(API_PROCESS_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<BackendResult<T>> {
    const url = this.baseUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(url, { ...init, signal: controller.signal });
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        return { ok: false, error: { failure: 'BAD_JSON', message: MESSAGES.BAD_JSON, detail: 'HTTP ' + res.status + ' non-JSON from ' + url } };
      }
      if (!res.ok && !isProcessResponse(data)) {
        return { ok: false, error: { failure: 'HTTP_ERROR', message: MESSAGES.HTTP_ERROR, detail: 'HTTP ' + res.status + ' from ' + url } };
      }
      return { ok: true, data: data as T };
    } catch (e) {
      const err = e as Error;
      const failure: BackendFailure = err && err.name === 'AbortError' ? 'TIMEOUT' : 'OFFLINE';
      const detail = (err && err.name ? err.name : 'Error') + ': ' + (err && err.message ? err.message : 'unknown') + ' [' + url + ']';
      return { ok: false, error: { failure, message: MESSAGES[failure], detail } };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function isProcessResponse(v: unknown): v is ProcessResponse {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.success === true) return typeof o.action === 'string' && typeof o.result === 'object';
  if (o.success === false) {
    const e = o.error as Record<string, unknown> | undefined;
    return typeof e === 'object' && e !== null && typeof e.code === 'string';
  }
  return false;
}

export function isHealthResponse(v: unknown): v is HealthResponse {
  return typeof v === 'object' && v !== null && (v as { status?: unknown }).status === 'ok';
}