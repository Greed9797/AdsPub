import { describe, expect, it } from 'vitest';
import type { Copy } from '@adpub/shared';
import { variantFingerprint } from '../src/repos/variants.js';
import type { VariantManifest } from '@adpub/shared';

const copy: Copy = {
  primary_text: 'Texto',
  headline: 'Título',
  description: 'Desc',
  cta: 'SHOP_NOW',
  link: 'https://lojateste.com.br/inverno',
  display_link: 'lojateste.com.br',
  url_tags: 'utm_source=facebook',
};

const base: VariantManifest = {
  format: 'single_video',
  assetIds: ['22222222-2222-4222-8222-222222222222'],
  copy,
  pageId: '100',
  igUserId: null,
  offerContext: null,
};

/** T-002-1 (AC-002-02/03): identidade é composição, nunca nome. */
describe('variantFingerprint', () => {
  it('mesmo vídeo + copies diferentes = variantes distintas', () => {
    const a = variantFingerprint(base);
    const b = variantFingerprint({ ...base, copy: { ...copy, headline: 'Outra' } });
    expect(a).not.toBe(b);
  });

  it('mesmo conteúdo = mesmo fingerprint (ordem de chave irrelevante)', () => {
    expect(variantFingerprint(base)).toBe(
      variantFingerprint({ copy, format: 'single_video', assetIds: [...base.assetIds], pageId: '100', igUserId: null, offerContext: null }),
    );
  });

  it('ordem das mídias importa (carrossel reordenado é outra variante)', () => {
    const ids: [string, string] = [
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ];
    expect(
      variantFingerprint({ ...base, format: 'carousel', assetIds: [ids[0], ids[1]] }),
    ).not.toBe(variantFingerprint({ ...base, format: 'carousel', assetIds: [ids[1], ids[0]] }));
  });
});
