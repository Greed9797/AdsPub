import { describe, expect, it } from 'vitest';
import {
  LOGIN_FAILED_MESSAGE,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isAllowedDomain,
  verifyPassword,
} from '../src/password.js';

describe('scrypt (e-mail + senha)', () => {
  it('confere a senha certa e recusa a errada', () => {
    const stored = hashPassword('senha-correta-0123456789');
    expect(verifyPassword('senha-correta-0123456789', stored)).toBe(true);
    expect(verifyPassword('senha-errada-9876543210', stored)).toBe(false);
  });

  it('usa salt por usuário: mesma senha gera hashes diferentes', () => {
    const first = hashPassword('mesma-senha-0123456789');
    const second = hashPassword('mesma-senha-0123456789');
    expect(first).not.toBe(second);
    expect(verifyPassword('mesma-senha-0123456789', first)).toBe(true);
    expect(verifyPassword('mesma-senha-0123456789', second)).toBe(true);
  });

  it('formato irreconhecível ou adulterado é só false', () => {
    expect(verifyPassword('qualquer-senha-123', '')).toBe(false);
    expect(verifyPassword('qualquer-senha-123', 'bcrypt$abc')).toBe(false);
    expect(verifyPassword('qualquer-senha-123', 'scrypt$1$2')).toBe(false);
    const stored = hashPassword('senha-valida-0123456789');
    const tampered = `${stored.slice(0, -1)}${stored.endsWith('0') ? '1' : '0'}`;
    expect(verifyPassword('senha-valida-0123456789', tampered)).toBe(false);
  });

  it('senha mínima de 12 e mensagem genérica única', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(LOGIN_FAILED_MESSAGE.length).toBeGreaterThan(0);
    expect(LOGIN_FAILED_MESSAGE).not.toMatch(/inativo|desconhecido|domínio/i);
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
