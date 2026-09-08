import { describe, expect, it } from 'vitest';
import { buildGoogleAuthUrl, isAllowedDomain } from '../src/google.js';
import { mintSessionToken, verifySessionToken } from '../src/session.js';

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
