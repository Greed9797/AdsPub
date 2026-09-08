import { describe, expect, it } from 'vitest';
import type { Copy } from '@adpub/shared';
import {
  archiveAd,
  buildCreativePayload,
  createAd,
  createAdCreative,
  createAdSet,
  createCampaign,
  getVideoStatus,
  uploadImage,
  uploadVideo,
} from '../src/write/index.js';
import { fixture, makeClient, stubFetch } from './helpers.js';

const copy: Copy = {
  primary_text: 'Coleção de inverno com 20% OFF.',
  headline: 'Inverno em oferta',
  description: 'Frete grátis',
  cta: 'SHOP_NOW',
  link: 'https://lojateste.com.br/inverno',
  display_link: 'lojateste.com.br',
  url_tags: 'utm_source=facebook&utm_medium=paid',
};

const body = (raw?: string) => new URLSearchParams(raw ?? '');

describe('buildCreativePayload (R9)', () => {
  it('imagem única usa link_data com image_hash', () => {
    const payload = buildCreativePayload({
      name: 'ad-1',
      pageId: '100',
      igUserId: '200',
      format: 'single_image',
      copy,
      media: { imageHash: 'abc123' },
      advantageCreativeOptout: true,
    });
    const linkData = payload.object_story_spec.link_data as Record<string, unknown>;
    expect(payload.object_story_spec.page_id).toBe('100');
    expect(payload.object_story_spec.instagram_user_id).toBe('200');
    expect(linkData.image_hash).toBe('abc123');
    expect(linkData.message).toBe(copy.primary_text);
    expect(linkData.name).toBe(copy.headline);
    expect(linkData.call_to_action).toEqual({ type: 'SHOP_NOW', value: { link: copy.link } });
    expect(payload.url_tags).toBe(copy.url_tags);
  });

  it('vídeo único usa video_data com thumbnail', () => {
    const payload = buildCreativePayload({
      name: 'ad-2',
      pageId: '100',
      format: 'single_video',
      copy,
      media: { videoId: 'vid1', thumbnailHash: 'thumb1' },
      advantageCreativeOptout: true,
    });
    const videoData = payload.object_story_spec.video_data as Record<string, unknown>;
    expect(videoData.video_id).toBe('vid1');
    expect(videoData.image_hash).toBe('thumb1');
    expect(videoData.title).toBe(copy.headline);
    expect(videoData.link_description).toBe(copy.description);
  });

  it('carrossel monta child_attachments por cartão', () => {
    const payload = buildCreativePayload({
      name: 'ad-3',
      pageId: '100',
      format: 'carousel',
      copy,
      media: {
        cards: [
          { imageHash: 'h1', headline: 'Card 1', description: 'd1', link: 'https://lojateste.com.br/1' },
          { videoId: 'v2', headline: 'Card 2', description: 'd2', link: '' },
        ],
      },
      advantageCreativeOptout: false,
    });
    const linkData = payload.object_story_spec.link_data as Record<string, unknown>;
    const children = linkData.child_attachments as Array<Record<string, unknown>>;
    expect(children).toHaveLength(2);
    expect(children[0]!.image_hash).toBe('h1');
    expect(children[1]!.video_id).toBe('v2');
    expect(children[1]!.link).toBe(copy.link);
    expect(linkData.multi_share_optimized).toBe(true);
  });

  it('controla melhorias Advantage+ pelo opt-out do cliente', () => {
    const optOut = buildCreativePayload({
      name: 'a',
      pageId: '1',
      format: 'single_image',
      copy,
      media: { imageHash: 'h' },
      advantageCreativeOptout: true,
    });
    const optIn = buildCreativePayload({
      name: 'a',
      pageId: '1',
      format: 'single_image',
      copy,
      media: { imageHash: 'h' },
      advantageCreativeOptout: false,
    });
    const spec = (p: typeof optOut) =>
      (
        (p.degrees_of_freedom_spec.creative_features_spec as Record<string, { enroll_status: string }>)
          .standard_enhancements
      ).enroll_status;
    expect(spec(optOut)).toBe('OPT_OUT');
    expect(spec(optIn)).toBe('OPT_IN');
  });

  it('omite call_to_action quando NO_BUTTON', () => {
    const payload = buildCreativePayload({
      name: 'a',
      pageId: '1',
      format: 'single_image',
      copy: { ...copy, cta: 'NO_BUTTON' },
      media: { imageHash: 'h' },
      advantageCreativeOptout: true,
    });
    expect((payload.object_story_spec.link_data as Record<string, unknown>).call_to_action).toBeUndefined();
  });

  it('falha rápido quando falta mídia', () => {
    expect(() =>
      buildCreativePayload({
        name: 'a',
        pageId: '1',
        format: 'single_image',
        copy,
        media: {},
        advantageCreativeOptout: true,
      }),
    ).toThrow(/image_hash/);
    expect(() =>
      buildCreativePayload({
        name: 'a',
        pageId: '1',
        format: 'carousel',
        copy,
        media: { cards: [{ imageHash: 'h', headline: '', description: '', link: '' }] },
        advantageCreativeOptout: true,
      }),
    ).toThrow(/2 cartões/);
  });
});

describe('escrita na Meta', () => {
  it('createCampaign força PAUSED e recusa objetivo legado', async () => {
    const stub = stubFetch([{ match: /campaigns/, json: fixture('campaign_created') }]);
    const client = makeClient(stub);
    const id = await createCampaign(client, 'act_1', {
      name: 'campanha',
      objective: 'OUTCOME_SALES',
      buying_type: 'AUCTION',
      special_ad_categories: [],
    });
    expect(id).toBe('23850000000000900');
    expect(body(stub.calls[0]!.body).get('status')).toBe('PAUSED');

    await expect(
      createCampaign(client, 'act_1', {
        name: 'legado',
        objective: 'CONVERSIONS' as unknown as 'OUTCOME_SALES',
        buying_type: 'AUCTION',
        special_ad_categories: [],
      }),
    ).rejects.toThrow(/FR-020/);
  });

  it('createAdSet nasce PAUSED com advantage_audience quando não há targeting', async () => {
    const stub = stubFetch([{ match: /adsets/, json: fixture('adset_created') }]);
    await createAdSet(makeClient(stub), 'act_1', {
      campaignId: 'c1',
      spec: {
        name: 'frio',
        optimization_goal: 'OFFSITE_CONVERSIONS',
        billing_event: 'IMPRESSIONS',
        advantage_audience: true,
      },
      pixelId: '9876543210',
    });
    const sent = body(stub.calls[0]!.body);
    expect(sent.get('status')).toBe('PAUSED');
    expect(JSON.parse(sent.get('targeting')!)).toMatchObject({
      targeting_automation: { advantage_audience: 1 },
    });
    expect(JSON.parse(sent.get('promoted_object')!)).toMatchObject({ pixel_id: '9876543210' });
  });

  it('createAd força PAUSED (Constituição II)', async () => {
    const stub = stubFetch([{ match: /\/ads$|\/ads\?/, json: fixture('ad_created') }]);
    const id = await createAd(makeClient(stub), 'act_1', {
      name: 'ad',
      adsetId: 'as1',
      creativeId: 'cr1',
    });
    expect(id).toBe('23850000000000903');
    const sent = body(stub.calls[0]!.body);
    expect(sent.get('status')).toBe('PAUSED');
    expect(JSON.parse(sent.get('creative')!)).toEqual({ creative_id: 'cr1' });
  });

  it('createAdCreative envia object_story_spec serializado', async () => {
    const stub = stubFetch([{ match: /adcreatives/, json: fixture('creative_created') }]);
    await createAdCreative(makeClient(stub), 'act_1', {
      name: 'creative',
      pageId: '100',
      igUserId: null,
      format: 'single_image',
      copy,
      media: { imageHash: 'abc' },
      advantageCreativeOptout: true,
    });
    const sent = body(stub.calls[0]!.body);
    expect(JSON.parse(sent.get('object_story_spec')!)).toMatchObject({ page_id: '100' });
    expect(sent.get('url_tags')).toBe(copy.url_tags);
  });

  it('uploadImage devolve o hash e manda multipart com credenciais', async () => {
    const stub = stubFetch([{ match: /adimages/, json: fixture('adimages') }]);
    const hash = await uploadImage(makeClient(stub), 'act_1', {
      filename: 'inverno-01.jpg',
      bytes: new Uint8Array([1, 2, 3]),
      mime: 'image/jpeg',
    });
    expect(hash).toBe('9c1f0f6f5b3d4a1e8f7c2b6d5e4a3f21');
    const form = stub.calls[0]!.form!;
    expect(form.get('access_token')).toBe('EAAG-token-de-teste');
    expect(form.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
    expect(form.get('source')).toBeInstanceOf(Blob);
  });

  it('uploadVideo faz start → transfer → finish e devolve video_id', async () => {
    const stub = stubFetch([
      { match: /advideos/, json: fixture('advideos_start') },
    ]);
    // start devolve end_offset 4194304; transfer devolve start=end → encerra
    const routes = [
      { match: /advideos/, json: fixture('advideos_start') },
    ];
    void routes;
    const client = makeClient(stub);
    const videoId = await uploadVideo(client, 'act_1', {
      filename: 'reel.mp4',
      bytes: new Uint8Array(10),
    });
    expect(videoId).toBe('1200000000001');
    expect(stub.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('getVideoStatus lê o status de processamento', async () => {
    const stub = stubFetch([{ match: /1200000000001/, json: fixture('video_status_ready') }]);
    const status = await getVideoStatus(makeClient(stub), '1200000000001');
    expect(status.status?.video_status).toBe('ready');
  });

  it('archiveAd usa status ARCHIVED (limpeza da fumaça)', async () => {
    const stub = stubFetch([{ match: /23850000000000903/, json: { success: true } }]);
    await archiveAd(makeClient(stub), '23850000000000903');
    expect(body(stub.calls[0]!.body).get('status')).toBe('ARCHIVED');
  });
});
