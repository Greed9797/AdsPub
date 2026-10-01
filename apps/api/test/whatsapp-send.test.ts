import { describe, expect, it, vi } from 'vitest';
import { toPublicWhatsappAccount, type WhatsappAccountRow } from '@adpub/db';
import { whatsappAccountDto } from '../src/lib/dto.js';
import { assertWhatsappSend, sendWhatsappMessage } from '../src/services/whatsapp.js';
import type { ApiDeps } from '../src/lib/deps.js';

const actor = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@empresa.com.br',
  name: 'Dev',
};

function depsThatMustNotCallGraph(): ApiDeps {
  return {
    metaClientForToken() {
      throw new Error('graph');
    },
  } as unknown as ApiDeps;
}

describe('envio WhatsApp', () => {
  it('viewer não chama a Meta', async () => {
    const graph = vi.fn(() => {
      throw new Error('graph');
    });
    const deps = { metaClientForToken: graph } as unknown as ApiDeps;
    await expect(
      sendWhatsappMessage(deps, { ...actor, role: 'viewer' }, 'acc', {
        to: '5511999990000',
        confirmTo: '5511999990000',
        template: 'pedido_pronto',
        language: 'pt_BR',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(graph).not.toHaveBeenCalled();
  });

  it('confirm_to diferente não chama a Meta', async () => {
    const graph = vi.fn(() => {
      throw new Error('graph');
    });
    const deps = { metaClientForToken: graph } as unknown as ApiDeps;
    await expect(
      sendWhatsappMessage(deps, { ...actor, role: 'manager' }, 'acc', {
        to: '5511999990000',
        confirmTo: '5511888880000',
        template: 'pedido_pronto',
        language: 'pt_BR',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(graph).not.toHaveBeenCalled();
    expect(() => assertWhatsappSend('manager', '5511999990000', '5511999990000')).not.toThrow();
  });

  it('confirm igual ainda não chama a Meta antes da conta', async () => {
    await expect(
      sendWhatsappMessage(depsThatMustNotCallGraph(), { ...actor, role: 'manager' }, 'acc', {
        to: '5511999990000',
        confirmTo: '5511999990000',
        template: 'pedido_pronto',
        language: 'pt_BR',
      }),
    ).rejects.toThrow();
  });

  it('token não aparece na resposta', () => {
    const secret = Buffer.from('TOKEN-SEGREDO-NAO-VAZAR');
    const row = {
      id: '00000000-0000-4000-8000-000000000010',
      clientId: '00000000-0000-4000-8000-000000000011',
      wabaId: '111',
      phoneNumberId: '222',
      displayName: 'Loja',
      displayPhone: '+55 11 99999-0000',
      tokenCiphertext: secret,
      tokenIv: Buffer.from('iv-secreto'),
      status: 'active',
      lastError: null,
      createdAt: new Date('2026-09-21T12:00:00.000Z'),
      updatedAt: new Date('2026-09-21T12:00:00.000Z'),
    } as WhatsappAccountRow;
    const pub = toPublicWhatsappAccount(row);
    expect(pub).not.toHaveProperty('tokenCiphertext');
    expect(pub).not.toHaveProperty('tokenIv');
    const dto = whatsappAccountDto(pub);
    const json = JSON.stringify(dto);
    expect(json).not.toContain('TOKEN-SEGREDO-NAO-VAZAR');
    expect(json).not.toContain('iv-secreto');
    expect(json).not.toMatch(/ciphertext|token_iv|access_token/);
    expect(dto).toMatchObject({ waba_id: '111', phone_number_id: '222', display_name: 'Loja' });
  });
});
