/** Erros RFC 9457 (T015). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: unknown[];
}

export class ProblemError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: unknown[];

  constructor(init: {
    status: number;
    title: string;
    type?: string;
    detail?: string;
    errors?: unknown[];
  }) {
    super(init.detail ?? init.title);
    this.name = 'ProblemError';
    this.status = init.status;
    this.title = init.title;
    this.type = init.type ?? `https://adpub.internal/problems/${init.status}`;
    if (init.detail !== undefined) this.detail = init.detail;
    if (init.errors !== undefined) this.errors = init.errors;
  }

  toJSON(): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

export const badRequest = (detail: string, errors?: unknown[]) =>
  new ProblemError({ status: 400, title: 'Requisição inválida', detail, ...(errors ? { errors } : {}) });

export const unauthorized = (detail = 'Sessão ausente ou inválida.') =>
  new ProblemError({ status: 401, title: 'Não autenticado', detail });

export const forbidden = (detail = 'Sem permissão para esta conta.') =>
  new ProblemError({ status: 403, title: 'Sem permissão', detail });

export const notFound = (detail: string) =>
  new ProblemError({ status: 404, title: 'Não encontrado', detail });
export const conflict = (detail: string) =>
  new ProblemError({ status: 409, title: 'Conflito', detail });

export const tooMany = (detail = 'Muitas tentativas. Tente novamente mais tarde.') =>
  new ProblemError({ status: 429, title: 'Muitas tentativas', detail });

export const unprocessable = (detail: string, errors?: unknown[]) =>
  new ProblemError({
    status: 422,
    title: 'Não foi possível processar',
    detail,
    ...(errors ? { errors } : {}),
  });
