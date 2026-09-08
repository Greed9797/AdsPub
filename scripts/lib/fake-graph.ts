/**
 * Graph API falsa para o smoke de integração: responde os endpoints de escrita
 * e leitura que o pipeline usa, contando chamadas por endpoint. Assim o smoke
 * exercita o caminho real (HTTP + assinatura + parser) sem tocar a Meta.
 */

export interface FakeGraphOptions {
  /** Nº de tentativas que devem falhar com erro transitório antes de dar certo. */
  failCreateAdTimes?: number;
  /** Nº de checagens de status em que o vídeo ainda aparece como processando. */
  videoProcessingChecks?: number;
}

export interface FakeGraph {
  fetchImpl: typeof fetch;
  calls: Map<string, number>;
  count(key: string): number;
  /** Faz as próximas `times` chamadas a `key` (`"POST act_x/ads"`) falharem com erro transitório. */
  failNext(key: string, times: number): void;
  ids: {
    campaign: string;
    adset: string;
    creative: string;
    ad: string;
    imageHash: string;
    videoId: string;
  };
}

const USAGE_HEADER = JSON.stringify({
  '1030000000001': [
    { type: 'ads_management', call_count: 12, total_cputime: 3, total_time: 5, estimated_time_to_regain_access: 0, ads_api_access_tier: 'standard_access' },
  ],
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-business-use-case-usage': USAGE_HEADER,
    },
  });
}

function graphError(input: {
  message: string;
  code: number;
  subcode?: number;
  status?: number;
}): Response {
  return json(
    {
      error: {
        message: input.message,
        code: input.code,
        ...(input.subcode ? { error_subcode: input.subcode } : {}),
        fbtrace_id: 'fake-trace',
      },
    },
    input.status ?? 400,
  );
}

export function createFakeGraph(options: FakeGraphOptions = {}): FakeGraph {
  const ids = {
    campaign: '23850000000000101',
    adset: '23850000000000202',
    creative: '23850000000000303',
    ad: '23850000000000404',
    imageHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    videoId: '10160000000000001',
  };
  const calls = new Map<string, number>();
  let adFailuresLeft = options.failCreateAdTimes ?? 0;
  let videoChecksLeft = options.videoProcessingChecks ?? 0;
  /** Falhas transientes pendentes por endpoint, alimentadas por `failNext`. */
  const failuresLeft = new Map<string, number>();

  function hit(key: string): number {
    const next = (calls.get(key) ?? 0) + 1;
    calls.set(key, next);
    return next;
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    // /v25.0/<path>
    const path = url.pathname.split('/').filter(Boolean).slice(1).join('/');
    const isForm = init?.body instanceof FormData;
    const body: Record<string, string> = {};
    if (init?.body instanceof URLSearchParams) {
      for (const [key, value] of init.body) body[key] = value;
    } else if (!isForm && typeof init?.body === 'string') {
      try {
        Object.assign(body, JSON.parse(init.body) as Record<string, string>);
      } catch {
        for (const [key, value] of new URLSearchParams(init.body)) body[key] = value;
      }
    }

    const key = `${method} ${path || 'batch'}`;
    hit(key);

    const pendente = failuresLeft.get(key) ?? 0;
    if (pendente > 0) {
      failuresLeft.set(key, pendente - 1);
      // Código 2 = erro transitório da plataforma: o pipeline deve reagendar.
      return graphError({ message: 'Serviço temporariamente indisponível.', code: 2, status: 500 });
    }

    if (method === 'GET' && path === 'me') {
      return json({ id: '61550000000001', name: 'AdPub System User' });
    }

    if (method === 'GET' && path.endsWith('/owned_ad_accounts')) {
      return json({
        data: [
          {
            id: 'act_1030000000001',
            account_id: '1030000000001',
            name: 'Loja Teste - BR',
            currency: 'BRL',
            timezone_name: 'America/Sao_Paulo',
            account_status: 1,
          },
        ],
      });
    }

    if (method === 'GET' && path.endsWith('/owned_pages')) {
      return json({
        data: [
          {
            id: '102030405060708',
            name: 'Loja Teste',
            instagram_business_account: { id: '17841400000000001', username: 'lojateste' },
          },
        ],
      });
    }

    if (method === 'GET' && path.endsWith('/owned_instagram_accounts')) {
      return json({ data: [{ id: '17841400000000001', username: 'lojateste' }] });
    }

    if (method === 'GET' && path.endsWith('/promote_pages')) {
      return json({ data: [{ id: '102030405060708', name: 'Loja Teste' }] });
    }

    if (method === 'GET' && path.endsWith('/adspixels')) {
      return json({ data: [{ id: '99887766554433', name: 'Pixel Loja Teste' }] });
    }

    if (method === 'GET' && path.endsWith('/campaigns')) {
      return json({ data: [] });
    }

    if (method === 'GET' && path.endsWith('/adsets')) {
      return json({ data: [] });
    }

    if (method === 'POST' && path.endsWith('/adimages')) {
      return json({ images: { bytes: { hash: ids.imageHash } } });
    }

    if (method === 'POST' && path.endsWith('/advideos')) {
      if (isForm) {
        const form = init?.body as FormData;
        const phase = String(form.get('upload_phase') ?? '');
        if (phase === 'transfer') {
          return json({ start_offset: '0', end_offset: '0' });
        }
        return json({ success: true });
      }
      const phase = body.upload_phase;
      if (phase === 'start') {
        return json({
          upload_session_id: 'session-1',
          video_id: ids.videoId,
          start_offset: '0',
          end_offset: '0',
        });
      }
      return json({ success: true });
    }

    if (method === 'GET' && path === ids.videoId) {
      if (videoChecksLeft > 0) {
        videoChecksLeft -= 1;
        return json({
          id: ids.videoId,
          status: { video_status: 'processing', processing_progress: 40 },
        });
      }
      return json({ id: ids.videoId, status: { video_status: 'ready' } });
    }

    if (method === 'POST' && path.endsWith('/campaigns')) {
      if (body.status !== 'PAUSED') {
        return graphError({ message: 'Campanha precisa nascer PAUSED no MVP.', code: 100 });
      }
      return json({ id: ids.campaign });
    }

    if (method === 'POST' && path.endsWith('/adsets')) {
      if (body.status !== 'PAUSED') {
        return graphError({ message: 'Conjunto precisa nascer PAUSED no MVP.', code: 100 });
      }
      return json({ id: ids.adset });
    }

    if (method === 'POST' && path.endsWith('/adcreatives')) {
      return json({ id: ids.creative });
    }

    if (method === 'POST' && path.endsWith('/ads')) {
      if (body.status !== 'PAUSED') {
        return graphError({ message: 'Anúncio precisa nascer PAUSED.', code: 100 });
      }
      if (adFailuresLeft > 0) {
        adFailuresLeft -= 1;
        return graphError({
          message: 'Please reduce the amount of data you are requesting.',
          code: 4,
          status: 400,
        });
      }
      return json({ id: ids.ad });
    }

    if (method === 'POST' && path === '') {
      const requests = JSON.parse(body.batch ?? '[]') as Array<{ relative_url: string }>;
      return json(
        requests.map((request) => ({
          code: 200,
          body: JSON.stringify({
            id: request.relative_url.split('?')[0],
            effective_status: 'PENDING_REVIEW',
            configured_status: 'PAUSED',
          }),
        })),
      );
    }

    // Arquivamento no teardown da fumaça: POST /<object_id> { status: ARCHIVED }.
    if (method === 'POST' && /^\d+$/.test(path)) {
      if (body.status !== 'ARCHIVED') {
        return graphError({ message: `Alteração não permitida no fake: status=${body.status}`, code: 100 });
      }
      return json({ success: true });
    }

    return graphError({ message: `Endpoint não mapeado no fake: ${method} ${path}`, code: 803 });
  };

  return {
    fetchImpl,
    calls,
    count: (key) => calls.get(key) ?? 0,
    failNext: (key, times) => failuresLeft.set(key, times),
    ids,
  };
}
