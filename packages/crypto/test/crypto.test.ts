import { describe, expect, it } from 'vitest';
import {
  TokenCipher,
  appsecretProof,
  idempotencyKey,
  mask,
  maskText,
  redact,
  stableHash,
} from '../src/index.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('TokenCipher', () => {
  it('faz round-trip do token', () => {
    const cipher = new TokenCipher(KEY);
    const sealed = cipher.encrypt('EAAG-token-do-system-user');
    expect(sealed.ciphertext.toString('utf8')).not.toContain('EAAG');
    expect(cipher.decrypt(sealed)).toBe('EAAG-token-do-system-user');
  });

  it('recusa chave com tamanho errado', () => {
    expect(() => new TokenCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });

  it('detecta ciphertext adulterado (GCM)', () => {
    const cipher = new TokenCipher(KEY);
    const sealed = cipher.encrypt('segredo');
    sealed.ciphertext[0] ^= 0xff;
    expect(() => cipher.decrypt(sealed)).toThrow();
  });

  it('gera IV distinto por chamada', () => {
    const cipher = new TokenCipher(KEY);
    const a = cipher.encrypt('x');
    const b = cipher.encrypt('x');
    expect(a.iv.equals(b.iv)).toBe(false);
  });
});

describe('mask/redact', () => {
  it('nunca devolve o segredo inteiro', () => {
    const masked = mask('EAAGabcdefghijklmnop');
    expect(masked).not.toContain('abcdefghijkl');
    expect(mask('curto')).toBe('***');
    expect(mask(undefined)).toBe('');
  });

  it('remove segredos aninhados de payloads de auditoria', () => {
    const out = redact({
      url: 'https://graph.facebook.com/v25.0/act_1/ads',
      params: { access_token: 'EAAGsupersecreto123', appsecret_proof: 'deadbeef', name: 'ad 1' },
      headers: { Authorization: 'Bearer abc' },
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain('EAAGsupersecreto123');
    expect(json).not.toContain('deadbeef');
    expect(json).toContain('ad 1');
  });

  it('mascara o token que a Meta ecoa em texto livre, fora de chave=valor', () => {
    const token = 'EAA-token-de-system-user-1234567890';
    // Mensagem literal da Graph API — o caminho de erro mais comum do worker.
    expect(maskText(`Malformed access token ${token}`)).toBe('Malformed access token [redacted]');
    expect(redact({ err: `Malformed access token ${token}` })).toEqual({
      err: 'Malformed access token [redacted]',
    });
  });

  it('mascara segredo na query string sem comer o resto da URL', () => {
    const out = maskText('https://graph.facebook.com/v25.0/me?access_token=EAAx123456&fields=id');
    expect(out).toBe('https://graph.facebook.com/v25.0/me?access_token=[redacted]&fields=id');
  });

  it('não mascara id, hash nem nome de conta', () => {
    const texto = 'act_1030000000001 sha256 3f786850e387550fdab836ed7e6dc881de23001b';
    expect(maskText(texto)).toBe(texto);
  });

  it('não quebra linha JSON já serializada com aspa escapada', () => {
    const linha = JSON.stringify({ msg: 'falhou ?access_token=EAAx123456" detalhe' });
    const mascarada = maskText(linha);

    const entry = JSON.parse(mascarada) as { msg: string };
    expect(entry.msg).toBe('falhou ?access_token=[redacted]" detalhe');
    expect(mascarada).not.toContain('EAAx123456');
  });

  it('preserva o resto da linha JSON com barra invertida no texto', () => {
    const linha = JSON.stringify({ err: 'token=EAAx123456\\ caminho C:\\tmp', ok: 1 });
    const entry = JSON.parse(maskText(linha)) as { err: string; ok: number };

    expect(entry.err).not.toContain('EAAx123456');
    expect(entry.err).toContain('caminho');
    expect(entry.ok).toBe(1);
  });
});

describe('idempotencyKey', () => {
  const base = { batchId: 'b1', position: 3, assetIds: ['a1'], copy: { primary_text: 'oi' } };

  it('é estável para a mesma entrada', () => {
    expect(idempotencyKey(base)).toBe(idempotencyKey({ ...base }));
  });

  it('muda quando a copy muda', () => {
    expect(idempotencyKey(base)).not.toBe(
      idempotencyKey({ ...base, copy: { primary_text: 'outra' } }),
    );
  });

  it('muda quando a posição muda', () => {
    expect(idempotencyKey(base)).not.toBe(idempotencyKey({ ...base, position: 4 }));
  });
});

describe('stableHash', () => {
  it('ignora ordem das chaves', () => {
    expect(stableHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      stableHash({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
  });
});

describe('appsecretProof', () => {
  it('é HMAC-SHA256 do token com o app secret', () => {
    expect(appsecretProof('token', 'secret')).toMatch(/^[0-9a-f]{64}$/);
    expect(appsecretProof('token', 'secret')).not.toBe(appsecretProof('token', 'outro'));
  });
});
