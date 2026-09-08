import { describe, expect, it } from 'vitest';
import {
  MetaApiError,
  MetaTimeoutError,
  classify,
  isTransientError,
  translate,
  translationTable,
} from '../src/errors.js';
import { fixture } from './helpers.js';

interface ErrorFixture {
  error: {
    message: string;
    code: number;
    error_subcode?: number;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

const asError = (name: string, httpStatus = 400) =>
  new MetaApiError({
    httpStatus,
    endpoint: '/v25.0/act_1/ads',
    method: 'POST',
    body: fixture<ErrorFixture>(name).error,
  });

describe('classify (R7)', () => {
  it.each([1, 2, 4, 17, 32, 613, 80004])('código %i é transiente', (code) => {
    expect(classify(code, undefined, 400)).toBe('transient');
  });

  it('190 é erro de credencial', () => {
    expect(classify(190, 463, 400)).toBe('auth');
  });

  it.each([100, 200, 2635])('código %i é permanente', (code) => {
    expect(classify(code, undefined, 400)).toBe('permanent');
  });

  it('HTTP 5xx sem código é transiente', () => {
    expect(classify(undefined, undefined, 503)).toBe('transient');
  });

  it('subcódigo 1487xxx é permanente', () => {
    expect(classify(100, 1487207, 400)).toBe('permanent');
  });
});

describe('MetaApiError a partir das fixtures', () => {
  it('token expirado (190) vira erro de auth traduzido', () => {
    const error = asError('error_190');
    expect(error.isAuth).toBe(true);
    expect(error.isTransient).toBe(false);
    expect(error.translated.title).toMatch(/Token do System User/);
    expect(error.translated.action).toMatch(/Gere um novo token/);
  });

  it('imagem pequena (100/1487207) sugere reexportar', () => {
    const error = asError('error_100_1487207');
    expect(error.kind).toBe('permanent');
    expect(error.translated.action).toContain('1080×1350');
    expect(error.subcode).toBe(1487207);
  });

  it('rate limit da conta (613) é transiente e reconhecido', () => {
    const error = asError('error_613');
    expect(error.isTransient).toBe(true);
    expect(error.isRateLimit).toBe(true);
  });

  it('tipo legado (2635) explica o fluxo unificado', () => {
    expect(asError('error_2635').translated.action).toMatch(/OUTCOME_/);
  });

  it('erro 5xx sem mapeamento é transiente', () => {
    const error = asError('error_500', 500);
    expect(error.isTransient).toBe(true);
  });

  it('toDraftError mantém original e tradução', () => {
    const draftError = asError('error_100_1487207').toDraftError('create_creative');
    expect(draftError.code).toBe(100);
    expect(draftError.message).toBe('Invalid parameter');
    expect(draftError.translated).toMatch(/menor que o mínimo/);
    expect(draftError.step).toBe('create_creative');
  });
});

describe('translate', () => {
  it('usa error_user_msg quando o código não é mapeado', () => {
    expect(translate(999999, undefined, { userMsg: 'Mensagem da Meta' }).title).toBe(
      'Mensagem da Meta',
    );
  });

  it('prefere a tradução por code/subcode', () => {
    expect(translate(100, 1487194).title).toMatch(/imagem não pôde ser processada/);
  });

  it('tem tabela para documentação', () => {
    const table = translationTable();
    expect(table.length).toBeGreaterThan(10);
    expect(table.every((row) => row.title && row.action)).toBe(true);
  });
});

describe('isTransientError', () => {
  it('trata timeout e falha de rede como transientes', () => {
    expect(isTransientError(new MetaTimeoutError('/v25.0/me', 1000))).toBe(true);
    expect(isTransientError(new Error('fetch failed'))).toBe(true);
    expect(isTransientError(new Error('erro de negócio'))).toBe(false);
  });
});
