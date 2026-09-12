import { describe, expect, it } from 'vitest';
import { normalizeVoiceProfile } from '@adpub/shared';

/**
 * Cliente gravado por seed/script antigo tem perfil parcial (`{tone}` só) e
 * derrubava a geração de plano com `undefined.join`. O schema é quem manda.
 */
describe('normalizeVoiceProfile', () => {
  it('completa os campos ausentes com os padrões do schema', () => {
    const profile = normalizeVoiceProfile({ tone: 'direto' });
    expect(profile).toEqual({
      tone: 'direto',
      audience: '',
      forbidden_terms: [],
      allowed_claims: [],
      examples: [],
    });
  });

  it('aceita perfil vazio ou nulo sem explodir', () => {
    expect(normalizeVoiceProfile(undefined).forbidden_terms).toEqual([]);
    expect(normalizeVoiceProfile(null).examples).toEqual([]);
  });

  it('preserva o que já está preenchido', () => {
    const profile = normalizeVoiceProfile({
      tone: 'direto',
      audience: 'mulheres 25-45',
      forbidden_terms: ['barato'],
      allowed_claims: ['garantia de 1 ano'],
      examples: ['Inverno com 20% OFF'],
    });
    expect(profile.forbidden_terms).toEqual(['barato']);
    expect(profile.allowed_claims).toEqual(['garantia de 1 ano']);
  });
});
