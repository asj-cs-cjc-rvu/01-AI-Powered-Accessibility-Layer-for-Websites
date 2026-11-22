import type { ErrorCode } from '@studylens/shared';

export type ProviderFailure =
  | 'CONFIGURATION' | 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'SERVER' | 'MALFORMED' | 'NETWORK';

const MAP: Record<ProviderFailure, ErrorCode> = {
  CONFIGURATION: 'INTERNAL_ERROR',
  AUTH: 'INTERNAL_ERROR',
  RATE_LIMIT: 'RATE_LIMITED',
  TIMEOUT: 'PROVIDER_TIMEOUT',
  SERVER: 'PROVIDER_ERROR',
  MALFORMED: 'PROVIDER_ERROR',
  NETWORK: 'PROVIDER_ERROR',
};

const SAFE: Record<ProviderFailure, string> = {
  CONFIGURATION: 'The AI provider is not configured correctly on the server.',
  AUTH: 'The AI provider rejected the server credentials.',
  RATE_LIMIT: 'The AI provider rate limit was reached. Try again shortly.',
  TIMEOUT: 'The AI provider took too long to respond. Try again.',
  SERVER: 'The AI provider failed to process the request.',
  MALFORMED: 'The AI provider returned an unusable response.',
  NETWORK: 'Could not reach the AI provider.',
};

export class ProviderError extends Error {
  readonly failure: ProviderFailure;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(failure: ProviderFailure, status?: number) {
    super(SAFE[failure]); // fixed safe string: never provider text, never credentials
    this.name = 'ProviderError';
    this.failure = failure;
    this.status = status;
    this.retryable =
      failure === 'RATE_LIMIT' || failure === 'TIMEOUT' || failure === 'SERVER' || failure === 'NETWORK';
  }

  get code(): ErrorCode { return MAP[this.failure]; }

  toSafeJSON() { return { failure: this.failure, code: this.code, retryable: this.retryable }; }
}