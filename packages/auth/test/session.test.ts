import { describe, expect, it } from 'vitest';
import { buildGoogleAuthUrl, identityFromClaims, isAllowedDomain } from '../src/google.js';
import { mintSessionToken, safeNextPath, verifySessionToken } from '../src/session.js';

const SECRET = 'segredo-de-teste-com-tamanho-suficiente';
const user = { id: 'u1', email: 'gestor@empresa.com.br', name: 'Gestor', role: 'manager' as const };

describe('sessão interna', () => {
  it('faz round-trip do usuário', async () => {
    const token = await mintSessionToken(user, SECRET);
    expect(await verifySessionToken(token, SECRET)).toEqual(user);
  });

  it('recusa token assinado com outro segredo', async () => {
    const token = await mintSessionToken(user, SECRET);
    await expect(verifySessionToken(token, 'outro-segredo-qualquer')).rejects.toThrow();
  });

  it('recusa token expirado', async () => {
    const token = await mintSessionToken(user, SECRET, -10);
    await expect(verifySessionToken(token, SECRET)).rejects.toThrow();
  });

  it('recusa papel inválido no payload', async () => {
    const token = await mintSessionToken(
      { ...user, role: 'root' as unknown as 'manager' },
      SECRET,
    );
    await expect(verifySessionToken(token, SECRET)).rejects.toThrow();
  });
});

describe('safeNextPath (volta pós-login)', () => {
  it('aceita caminho interno, com query', () => {
    expect(safeNextPath('/authorize?client_id=c1&state=s1')).toBe('/authorize?client_id=c1&state=s1');
    expect(safeNextPath('/contas')).toBe('/contas');
  });

  it('recusa host externo e caminho vazio', () => {
    expect(safeNextPath('//evil.com/login')).toBeUndefined();
    expect(safeNextPath('https://evil.com')).toBeUndefined();
    expect(safeNextPath('contas')).toBeUndefined();
    expect(safeNextPath('')).toBeUndefined();
    expect(safeNextPath(null)).toBeUndefined();
    expect(safeNextPath(undefined)).toBeUndefined();
  });
});

describe('isAllowedDomain (US6 cenário 3)', () => {
  it('aceita só o domínio corporativo', () => {
    expect(isAllowedDomain('a@empresa.com.br', 'empresa.com.br')).toBe(true);
    expect(isAllowedDomain('a@empresa.com.br', '@empresa.com.br')).toBe(true);
    expect(isAllowedDomain('a@gmail.com', 'empresa.com.br')).toBe(false);
    expect(isAllowedDomain('a@fake-empresa.com.br', 'empresa.com.br')).toBe(false);
    expect(isAllowedDomain('a@empresa.com.br', '')).toBe(false);
  });
});

describe('buildGoogleAuthUrl', () => {
  it('inclui domínio, state e nonce', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://localhost:3000/api/auth/callback',
        state: 'st',
        nonce: 'no',
        hostedDomain: 'empresa.com.br',
      }),
    );
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('hd')).toBe('empresa.com.br');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('no');
    expect(url.searchParams.get('scope')).toContain('email');
  });
});

describe('identityFromClaims (R16)', () => {
  const claims = {
    sub: '1',
    email: 'Gestor@Empresa.com.br',
    email_verified: true,
    name: 'Gestor',
    hd: 'empresa.com.br',
    nonce: 'no',
  };
  const expected = { nonce: 'no', allowedDomain: 'empresa.com.br' };

  it('aceita conta do Workspace e normaliza e-mail', () => {
    expect(identityFromClaims(claims, expected)).toEqual({
      sub: '1',
      email: 'gestor@empresa.com.br',
      name: 'Gestor',
      hd: 'empresa.com.br',
    });
  });

  it('recusa conta sem hd mesmo com e-mail no domínio', () => {
    const { hd: _hd, ...semHd } = claims;
    expect(() => identityFromClaims(semHd, expected)).toThrow(/fora do domínio/);
  });

  it('aceita domínio secundário do Workspace (hd é o primário)', () => {
    const secundario = { ...claims, email: 'gestor@empresa.com.br', hd: 'grupo-empresa.com' };
    expect(identityFromClaims(secundario, expected).hd).toBe('grupo-empresa.com');
  });

  it('recusa e-mail fora do domínio permitido mesmo com hd', () => {
    expect(() => identityFromClaims({ ...claims, email: 'x@outra.com' }, expected)).toThrow(
      /fora do domínio/,
    );
  });

  it('recusa e-mail não verificado', () => {
    expect(() => identityFromClaims({ ...claims, email_verified: false }, expected)).toThrow(
      /e-mail verificado/,
    );
  });

  it('recusa nonce ausente ou diferente', () => {
    expect(() => identityFromClaims(claims, { ...expected, nonce: '' })).toThrow(/Nonce/);
    expect(() => identityFromClaims(claims, { ...expected, nonce: 'outro' })).toThrow(/Nonce/);
  });

  it('recusa domínio permitido vazio', () => {
    expect(() => identityFromClaims(claims, { ...expected, allowedDomain: '' })).toThrow(
      /fora do domínio/,
    );
  });
});
