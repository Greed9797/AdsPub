import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { OptimisticLockError } from '@adpub/db';
import { MetaApiError } from '@adpub/meta-client';
import { AiSchemaError } from '@adpub/ai';
import { ProblemError } from '../lib/problem.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply
      .status(404)
      .type('application/problem+json')
      .send({
        type: 'https://adpub.internal/problems/404',
        title: 'Rota não encontrada',
        status: 404,
        detail: `${request.method} ${request.url}`,
      });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ProblemError) {
      request.log.info({ err: error.message, status: error.status }, 'problema tratado');
      return reply.status(error.status).type('application/problem+json').send(error.toJSON());
    }

    if (error instanceof ZodError) {
      return reply
        .status(422)
        .type('application/problem+json')
        .send({
          type: 'https://adpub.internal/problems/422',
          title: 'Payload inválido',
          status: 422,
          detail: 'Corpo da requisição fora do schema.',
          errors: error.issues,
        });
    }

    if (error instanceof OptimisticLockError) {
      return reply.status(409).type('application/problem+json').send({
        type: 'https://adpub.internal/problems/409',
        title: 'Conflito de edição',
        status: 409,
        detail: error.message,
      });
    }

    if (error instanceof AiSchemaError) {
      return reply.status(422).type('application/problem+json').send({
        type: 'https://adpub.internal/problems/422',
        title: 'Resposta da IA inválida',
        status: 422,
        detail: error.message,
      });
    }

    if (error instanceof MetaApiError) {
      return reply
        .status(502)
        .type('application/problem+json')
        .send({
          type: 'https://adpub.internal/problems/502',
          title: error.translated.title,
          status: 502,
          detail: error.translated.action,
          errors: [{ code: error.code, subcode: error.subcode, message: error.message }],
        });
    }

    const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    request.log.error({ err: error }, 'erro não tratado');
    return reply
      .status(status)
      .type('application/problem+json')
      .send({
        type: `https://adpub.internal/problems/${status}`,
        title: status >= 500 ? 'Erro interno' : 'Requisição inválida',
        status,
        detail: status >= 500 ? 'Falha inesperada. Consulte os logs.' : error.message,
      });
  });
}
