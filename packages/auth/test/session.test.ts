import { describe, expect, it } from 'vitest';
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

