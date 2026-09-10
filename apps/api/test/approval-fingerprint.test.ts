import { describe, expect, it } from 'vitest';
import { approvalFingerprint, type FingerprintDraft } from '../src/services/approval.js';

const base: FingerprintDraft = {
  id: '11111111-1111-1111-1111-111111111111',
  copy: {
    primary_text: 'Texto',
    headline: 'Título',
    description: 'Desc',
    cta: 'SHOP_NOW',
    link: 'https://lojateste.com.br/inverno',
    display_link: 'lojateste.com.br',
    url_tags: 'utm_source=facebook',
  },
  name: 'item-1',
  campaignRef: { kind: 'existing', id: 'c1' },
  adsetRef: { kind: 'existing', id: 'a1' },
  format: 'single_image',
  assetIds: ['22222222-2222-2222-2222-222222222222'],
  pageId: '100',
  igUserId: null,
  status: 'ready',
};

/** T-000-3 (AC-000-04): aprovação congela conteúdo, não carimbo de fila. */
describe('approvalFingerprint', () => {
  it('ignora ordem dos itens', () => {
    const outro = { ...base, id: '33333333-3333-3333-3333-333333333333', status: 'failed' as const };
    expect(approvalFingerprint([{ ...base }, outro])).toBe(approvalFingerprint([outro, { ...base }]));
  });

  it('qualquer edição de conteúdo muda o fingerprint', () => {
    const antes = approvalFingerprint([{ ...base }]);
    expect(approvalFingerprint([{ ...base, name: 'item-2' }])).not.toBe(antes);
    expect(approvalFingerprint([{ ...base, copy: { ...base.copy, headline: 'Outro' } }])).not.toBe(antes);
    expect(approvalFingerprint([{ ...base, pageId: '200' }])).not.toBe(antes);
    expect(approvalFingerprint([{ ...base, assetIds: [] }])).not.toBe(antes);
  });

  it('ignora itens fora do universo publicável', () => {
    const antes = approvalFingerprint([{ ...base }]);
    expect(approvalFingerprint([{ ...base }, { ...base, id: 'x', status: 'draft' }])).toBe(antes);
    expect(approvalFingerprint([{ ...base }, { ...base, id: 'x', status: 'published' }])).toBe(antes);
  });
});
