import { DEFAULT_LANGUAGE } from '@studylens/shared';
import type { ProcessResult } from '@studylens/shared';
import type { AiProvider, ProviderRequest } from '../provider.interface';
import { validateResult } from '../validation/result.validation';

export class MockProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-model';

  async complete(req: ProviderRequest): Promise<ProcessResult> {
    const language = req.targetLanguage ?? DEFAULT_LANGUAGE;

    const raw =
      req.action === 'explain'
        ? {
            text: `Explanation: ${req.text}`,
            steps: [],
            caveats: ['This is a mock response. Set AI_PROVIDER=groq for real explanations.'],
          }
        : req.action === 'translate'
        ? {
            text: `[${language}] ${req.text}`,
            steps: [],
            caveats: ['This is a mock translation. Set AI_PROVIDER=groq for real translation.'],
          }
        : req.action === 'steps'
        ? {
            text: `Guide for: ${req.text}`,
            steps: [
              'Step 1: Read the source text carefully.',
              'Step 2: Identify the key idea or action.',
              'Step 3: Restate it in your own words.',
            ],
            caveats: ['This is a mock guide. Set AI_PROVIDER=groq for real steps.'],
          }
        : {
            text: `Simplified: ${req.text}`,
            steps: [],
            caveats: ['This is a mock response. Set AI_PROVIDER=groq for real simplification.'],
          };

    return validateResult(raw, language);
  }
}