import type { Application, Response } from 'express';
import {
  API_PROCESS_PATH,
  validateProcessRequest,
  ERROR_HTTP_STATUS,
} from '@studylens/shared';
import type { Action, ErrorCode, ProcessErrorResponse, ProcessSuccessResponse } from '@studylens/shared';
import type { AiProvider } from '../ai/provider.interface';
import { ProviderError } from '../ai/errors/provider.errors';

const IMPLEMENTED_ACTIONS = new Set<Action>(['simplify', 'explain', 'translate', 'steps']);

export function sendError(res: Response, code: ErrorCode, message: string, requestId: string): void {
  const body: ProcessErrorResponse = { success: false, error: { code, message }, requestId };
  res.status(ERROR_HTTP_STATUS[code]).json(body);
}

export function registerProcessRoute(app: Application, provider: AiProvider): void {
  app.post(API_PROCESS_PATH, async (req, res) => {
    const requestId = String(res.locals.requestId ?? '');

    const validation = validateProcessRequest(req.body);
    if (!validation.ok) {
      sendError(res, validation.code, validation.message, requestId);
      return;
    }

    const { action, text, targetLanguage } = validation.value;

    if (!IMPLEMENTED_ACTIONS.has(action)) {
      sendError(res, 'INTERNAL_ERROR', `The "${action}" feature is not implemented yet.`, requestId);
      return;
    }

    try {
      const result = await provider.complete({ action, text, targetLanguage, requestId });
      const body: ProcessSuccessResponse = { success: true, action, result, requestId };
      res.status(200).json(body);
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError('SERVER');
      console.error(JSON.stringify({ requestId, providerFailure: err.failure, code: err.code }));
      sendError(res, err.code, err.message, requestId);
    }
  });
}