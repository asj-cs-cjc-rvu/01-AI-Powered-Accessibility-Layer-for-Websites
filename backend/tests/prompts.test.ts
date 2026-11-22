import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/ai/prompts';
import type { Action, Language } from '@studylens/shared';

const sampleText = 'Photosynthesis converts light energy into chemical energy.';

describe('prompt generation', () => {
  const actions: Action[] = ['simplify', 'explain', 'translate', 'steps'];
  const languages: Language[] = ['en', 'hi', 'kn'];

  for (const action of actions) {
    for (const lang of languages) {
      it(`generates valid prompt for ${action} + ${lang}`, () => {
        const p = buildPrompt(action, sampleText, lang);
        assert.ok(typeof p.system === 'string' && p.system.length > 50, 'system prompt too short');
        assert.ok(typeof p.user === 'string' && p.user.length > 10, 'user prompt too short');
        assert.ok(p.system.includes('SOURCE MATERIAL'), 'missing safety instruction');
        assert.ok(p.system.includes('JSON'), 'missing output contract');
        
        // Action-specific checks
        if (action === 'translate') {
          const langNames: Record<Language, string> = { en: 'English', hi: 'Hindi', kn: 'Kannada' };
          assert.ok(p.system.includes(langNames[lang].toUpperCase()), `missing target language ${langNames[lang]}`);
        }
        if (action === 'guide') {
          assert.ok(p.system.includes('STEP'), 'missing step instruction');
        }
        if (action === 'explain') {
          assert.ok(p.system.includes('EXPLAIN'), 'missing explain instruction');
        }
        if (action === 'steps') {
          assert.ok(p.system.includes('STEP'), 'missing step instruction');
        }
      });
    }
  }

  it('throws for unknown action', () => {
    assert.throws(() => buildPrompt('unknown' as Action, sampleText, 'en'));
  });

  it('preserves source text in user prompt', () => {
    const p = buildPrompt('simplify', sampleText, 'en');
    assert.ok(p.user.includes(sampleText), 'source text missing from user prompt');
  });
});