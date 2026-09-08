/** R7: classificação e tradução de erros da Graph API. */

export type ErrorKind = 'transient' | 'permanent' | 'auth';

export interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export interface Translation {
  title: string;
  action: string;
}

/** Erros transientes: vale retry com backoff. */
export const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613, 80004]);
/** Erros de credencial: pausa tudo e alerta (US1 cenário 3). */
export const AUTH_CODES = new Set([190, 102, 463, 467]);
/** Erros de rate limit que carregam tempo de espera. */
export const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004]);

const TRANSLATIONS: Record<string, Translation> = {
  '1': {
    title: 'A Meta teve um erro temporário ao processar o pedido.',
    action: 'O item será reprocessado automaticamente.',
  },
  '2': {
    title: 'Serviço da Meta indisponível no momento.',
    action: 'O item será reprocessado automaticamente em alguns minutos.',
  },
  '4': {
    title: 'Limite de chamadas do aplicativo atingido.',
    action: 'A fila desta conta ficará pausada até o limite liberar.',
  },
  '17': {
    title: 'Limite de chamadas do usuário atingido.',
    action: 'A fila desta conta ficará pausada até o limite liberar.',
  },
  '32': {
    title: 'Limite de chamadas da página atingido.',
    action: 'A fila desta conta ficará pausada até o limite liberar.',
  },
  '613': {
    title: 'Limite de chamadas da conta de anúncio atingido.',
    action: 'A fila desta conta fica pausada pelo tempo informado pela Meta.',
  },
  '80004': {
    title: 'Limite de chamadas de anúncios atingido para esta conta.',
    action: 'A fila desta conta fica pausada até o limite liberar.',
  },
  '100': {
    title: 'A Meta recusou um parâmetro do anúncio.',
    action: 'Revise os campos do item; o detalhe original está em "detalhes".',
  },
  '190': {
    title: 'Token do System User inválido ou expirado.',
    action: 'Gere um novo token na BM e atualize a conexão em Contas.',
  },
  '200': {
    title: 'O System User não tem permissão para esta ação nesta conta.',
    action: 'Confira na BM se a conta, a página e o Instagram estão atribuídos ao System User.',
  },
  '272': {
    title: 'Sem permissão para usar esta página no anúncio.',
    action: 'Atribua a página ao System User na Business Manager.',
  },
  '2635': {
    title: 'Este tipo de campanha foi descontinuado pela Meta.',
    action: 'Use objetivos OUTCOME_* no fluxo unificado Advantage+.',
  },
  '100/1487194': {
    title: 'A imagem não pôde ser processada pela Meta.',
    action: 'Reexporte o arquivo em JPG/PNG dentro das proporções aceitas e importe de novo.',
  },
  '100/1487207': {
    title: 'A imagem é menor que o mínimo aceito.',
    action: 'Reexporte com pelo menos 600 px em cada lado — ex.: 1080×1350.',
  },
  '100/1487390': {
    title: 'A copy tem termos que a Meta reprova.',
    action: 'Reescreva o texto seguindo os avisos de política.',
  },
  '100/1487748': {
    title: 'A conta de anúncio não pode publicar agora.',
    action: 'Verifique pagamento/limite de gastos da conta no Ads Manager.',
  },
  '100/1885183': {
    title: 'O criativo é incompatível com o posicionamento escolhido.',
    action: 'Ajuste a proporção do criativo ou o posicionamento do conjunto.',
  },
  '100/2490408': {
    title: 'A URL de destino foi recusada.',
    action: 'Confirme o domínio verificado e o link informado.',
  },
};

export function classify(code?: number, subcode?: number, httpStatus?: number): ErrorKind {
  if (code !== undefined && AUTH_CODES.has(code)) return 'auth';
  if (code !== undefined && TRANSIENT_CODES.has(code)) return 'transient';
  if (httpStatus !== undefined && httpStatus >= 500) return 'transient';
  if (code === undefined && httpStatus === undefined) return 'transient';
  if (subcode !== undefined && subcode >= 1487000 && subcode <= 1487999) return 'permanent';
  return 'permanent';
}

export function translate(
  code?: number,
  subcode?: number,
  fallback?: { userMsg?: string; message?: string },
): Translation {
  const keyed = code !== undefined && subcode !== undefined ? `${code}/${subcode}` : undefined;
  const translation =
    (keyed ? TRANSLATIONS[keyed] : undefined) ??
    (code !== undefined ? TRANSLATIONS[String(code)] : undefined);
  if (translation) return translation;
  return {
    title: fallback?.userMsg?.trim() || fallback?.message?.trim() || 'Erro não mapeado da Meta.',
    action: 'Abra "detalhes" para ver a resposta original da Meta.',
  };
}

export interface MetaApiErrorInit {
  httpStatus: number;
  endpoint: string;
  method: string;
  body?: GraphErrorBody;
  raw?: unknown;
  estimatedTimeToRegainAccessMs?: number;
}

export class MetaApiError extends Error {
  readonly httpStatus: number;
  readonly endpoint: string;
  readonly method: string;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  readonly kind: ErrorKind;
  readonly translated: Translation;
  readonly raw?: unknown;
  readonly estimatedTimeToRegainAccessMs?: number;

  constructor(init: MetaApiErrorInit) {
    const body = init.body ?? {};
    const translated = translate(body.code, body.error_subcode, {
      userMsg: body.error_user_msg,
      message: body.message,
    });
    super(body.message ?? `Erro HTTP ${init.httpStatus} em ${init.endpoint}`);
    this.name = 'MetaApiError';
    this.httpStatus = init.httpStatus;
    this.endpoint = init.endpoint;
    this.method = init.method;
    this.code = body.code;
    this.subcode = body.error_subcode;
    this.fbtraceId = body.fbtrace_id;
    this.kind = classify(body.code, body.error_subcode, init.httpStatus);
    this.translated = translated;
    this.raw = init.raw;
    if (init.estimatedTimeToRegainAccessMs !== undefined) {
      this.estimatedTimeToRegainAccessMs = init.estimatedTimeToRegainAccessMs;
    }
  }

  get isTransient(): boolean {
    return this.kind === 'transient';
  }

  get isAuth(): boolean {
    return this.kind === 'auth';
  }

  get isRateLimit(): boolean {
    return this.code !== undefined && RATE_LIMIT_CODES.has(this.code);
  }

  toDraftError(step?: string) {
    return {
      ...(this.code !== undefined ? { code: this.code } : {}),
      ...(this.subcode !== undefined ? { subcode: this.subcode } : {}),
      message: this.message,
      translated: this.translated.title,
      action: this.translated.action,
      ...(step ? { step } : {}),
    };
  }
}

export class MetaTimeoutError extends Error {
  readonly kind: ErrorKind = 'transient';
  constructor(
    readonly endpoint: string,
    readonly timeoutMs: number,
  ) {
    super(`Timeout de ${timeoutMs} ms ao chamar ${endpoint}`);
    this.name = 'MetaTimeoutError';
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof MetaApiError) return error.isTransient;
  if (error instanceof MetaTimeoutError) return true;
  if (error instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(error.message)) {
    return true;
  }
  return false;
}

/** Mapa completo, usado para gerar docs/erros-meta.md. */
export function translationTable(): Array<{ key: string } & Translation> {
  return Object.entries(TRANSLATIONS).map(([key, value]) => ({ key, ...value }));
}
