import { describe, expect, it } from 'vitest';
import {
  getAdsStatus,
  getMe,
  listAccountPages,
  listAdSets,
  listCampaigns,
  listIgAccounts,
  listOwnedAdAccounts,
  listPages,
  listPixels,
} from '../src/read/index.js';
import { MetaApiError } from '../src/errors.js';
import { fixture, makeClient, stubFetch } from './helpers.js';

const routes = [
  { match: /\/v25\.0\/me\?/, json: fixture('me') },
  { match: /owned_ad_accounts/, json: fixture('owned_ad_accounts') },
  { match: /owned_pages/, json: fixture('owned_pages') },
  { match: /owned_instagram_accounts/, json: fixture('owned_instagram_accounts') },
  { match: /adspixels/, json: fixture('adspixels') },
  { match: /promote_pages/, json: fixture('promote_pages') },
  { match: /campaigns/, json: fixture('campaigns') },
  { match: /adsets/, json: fixture('adsets') },
];

describe('leituras da Graph API (contrato)', () => {
  it('/me devolve o System User', async () => {
    const stub = stubFetch(routes);
    const me = await getMe(makeClient(stub));
    expect(me.id).toBe('61550000000001');
  });

  it('toda URL carrega a versão fixada e o appsecret_proof', async () => {
    const stub = stubFetch(routes);
    await getMe(makeClient(stub));
    const url = new URL(stub.calls[0]!.url);
    expect(url.pathname.startsWith('/v25.0/')).toBe(true);
    expect(url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('access_token')).toBe('EAAG-token-de-teste');
  });

  it('registra a chamada com versão e latência', async () => {
    const stub = stubFetch(routes);
    await getMe(makeClient(stub));
    expect(stub.logs[0]).toMatchObject({
      method: 'GET',
      apiVersion: 'v25.0',
      statusCode: 200,
    });
    expect(stub.logs[0]!.endpoint).toContain('/v25.0/me');
  });

  it('lista contas de anúncio da BM', async () => {
    const stub = stubFetch(routes);
    const accounts = await listOwnedAdAccounts(makeClient(stub), '99887766');
    expect(accounts.map((a) => a.id)).toEqual(['act_1030000000001', 'act_1030000000002']);
    expect(accounts[0]!.currency).toBe('BRL');
  });

  it('lista páginas com Instagram vinculado', async () => {
    const stub = stubFetch(routes);
    const pages = await listPages(makeClient(stub), '99887766');
    expect(pages[0]!.instagram_business_account?.id).toBe('17841400000000001');
    expect(pages[1]!.instagram_business_account).toBeUndefined();
  });

  it('lista IGs, pixels, páginas da conta, campanhas e conjuntos', async () => {
    const stub = stubFetch(routes);
    const client = makeClient(stub);
    expect((await listIgAccounts(client, '99887766'))[0]!.username).toBe('lojateste');
    expect((await listPixels(client, 'act_1030000000001'))[0]!.id).toBe('9876543210');
    expect((await listAccountPages(client, 'act_1030000000001'))[0]!.id).toBe('100000000000001');
    expect((await listCampaigns(client, 'act_1030000000001'))[0]!.objective).toBe('OUTCOME_SALES');
    expect((await listAdSets(client, 'act_1030000000001'))[0]!.campaign_id).toBe(
      '23850000000000001',
    );
  });

  it('normaliza id da conta sem prefixo act_', async () => {
    const stub = stubFetch(routes);
    await listPixels(makeClient(stub), '1030000000001');
    expect(stub.calls[0]!.url).toContain('/act_1030000000001/adspixels');
  });

  it('para de paginar quando não há next', async () => {
    const stub = stubFetch(routes);
    await listOwnedAdAccounts(makeClient(stub), '99887766');
    expect(stub.calls).toHaveLength(1);
  });

  it('lança MetaApiError traduzido em resposta de erro', async () => {
    const stub = stubFetch([{ match: /\/me\?/, status: 400, json: fixture('error_190') }]);
    await expect(getMe(makeClient(stub))).rejects.toBeInstanceOf(MetaApiError);
  });
});

describe('getAdsStatus (R11)', () => {
  it('lê status de revisão em batch', async () => {
    const stub = stubFetch([{ match: /graph\.facebook\.com\/v25\.0\/$/, json: fixture('ads_status_batch') }]);
    const statuses = await getAdsStatus(makeClient(stub), [
      '23850000000000903',
      '23850000000000904',
    ]);
    expect(statuses).toHaveLength(2);
    expect(statuses[0]!.effective_status).toBe('PENDING_REVIEW');
    expect(statuses[1]!.ad_review_feedback).toBeDefined();
  });

  it('quebra em lotes de 50 IDs', async () => {
    const stub = stubFetch([{ match: /graph\.facebook\.com\/v25\.0\/$/, json: [] }]);
    const ids = Array.from({ length: 120 }, (_, i) => `ad-${i}`);
    await getAdsStatus(makeClient(stub), ids);
    expect(stub.calls).toHaveLength(3);
  });

  it('não retorna nada para lista vazia', async () => {
    const stub = stubFetch([]);
    expect(await getAdsStatus(makeClient(stub), [])).toEqual([]);
    expect(stub.calls).toHaveLength(0);
  });
});
