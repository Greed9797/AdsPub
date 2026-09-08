import { describe, expect, it } from 'vitest';
import {
  buildUrlTags,
  displayLinkFor,
  interpolateTokens,
  isAllowedDomain,
  mergeUrlTags,
  missingUtmKeys,
  parseUrl,
} from '../src/url.js';

describe('parseUrl', () => {
  it('aceita http(s) e recusa outros protocolos', () => {
    expect(parseUrl('https://a.com')).not.toBeNull();
    expect(parseUrl('javascript:alert(1)')).toBeNull();
    expect(parseUrl('não é url')).toBeNull();
  });
});

describe('isAllowedDomain', () => {
  it('sem lista configurada libera tudo', () => {
    expect(isAllowedDomain('https://qualquer.com', [])).toBe(true);
  });

  it('compara domínio e subdomínio', () => {
    expect(isAllowedDomain('https://loja.com.br/x', ['loja.com.br'])).toBe(true);
    expect(isAllowedDomain('https://www.loja.com.br/x', ['loja.com.br'])).toBe(true);
    expect(isAllowedDomain('https://loja.com.br.evil.com', ['loja.com.br'])).toBe(false);
  });
});

describe('buildUrlTags', () => {
  it('monta querystring a partir do UTM padrão', () => {
    expect(buildUrlTags({ utm_source: 'facebook', utm_medium: 'paid' })).toBe(
      'utm_source=facebook&utm_medium=paid',
    );
  });

  it('interpola tokens do contexto', () => {
    expect(buildUrlTags({ utm_campaign: '{cliente}-{objetivo}' }, { cliente: 'loja', objetivo: 'vendas' })).toBe(
      'utm_campaign=loja-vendas',
    );
  });

  it('preserva macros da Meta com chaves duplas', () => {
    expect(buildUrlTags({ utm_content: '{{ad_name}}' })).toBe('utm_content={{ad_name}}');
  });

  it('descarta parâmetros que resolvem para vazio', () => {
    expect(buildUrlTags({ utm_source: 'facebook', utm_term: '{inexistente}' })).toBe(
      'utm_source=facebook',
    );
  });
});

describe('interpolateTokens', () => {
  it('mantém macro dupla intacta e resolve token simples', () => {
    expect(interpolateTokens('{{site_source_name}}/{cliente}', { cliente: 'loja' })).toBe(
      '{{site_source_name}}/loja',
    );
  });
});

describe('mergeUrlTags', () => {
  it('mantém o valor manual e adiciona o que falta', () => {
    expect(mergeUrlTags('utm_source=meu', 'utm_source=facebook&utm_medium=paid')).toBe(
      'utm_source=meu&utm_medium=paid',
    );
  });
});

describe('missingUtmKeys', () => {
  it('lista só o que falta', () => {
    expect(missingUtmKeys('utm_source=x', { utm_source: 'a', utm_medium: 'b' })).toEqual([
      'utm_medium',
    ]);
  });
});

describe('displayLinkFor', () => {
  it('remove www', () => {
    expect(displayLinkFor('https://www.loja.com.br/x')).toBe('loja.com.br');
    expect(displayLinkFor('inválido')).toBe('');
  });
});
