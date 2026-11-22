import type { Action, Language, ProcessResult } from '@studylens/shared';

export interface ProviderRequest {
  action: Action;
  text: string;
  targetLanguage?: Language;
  requestId: string;
}

/** Provider-independent boundary. No Groq-specific shapes leak past this. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(req: ProviderRequest): Promise<ProcessResult>;
}