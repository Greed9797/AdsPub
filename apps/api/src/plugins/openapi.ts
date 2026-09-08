import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { parse } from 'yaml';

/** T015: OpenAPI servido a partir do contrato versionado em specs/. */
const CONTRACT_CANDIDATES = [
  '../../../../specs/001-mvp-publicacao-lote/contracts/api.openapi.yaml',
  '../../../specs/001-mvp-publicacao-lote/contracts/api.openapi.yaml',
];

export function loadContract(): Record<string, unknown> | undefined {
  for (const candidate of CONTRACT_CANDIDATES) {
    try {
      const path = fileURLToPath(new URL(candidate, import.meta.url));
      return parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  const contract = loadContract();
  await app.register(swagger, {
    mode: 'static',
    specification: contract
      ? { document: contract as never }
      : {
          document: {
            openapi: '3.1.0',
            info: { title: 'AdPub — API interna', version: '0.1.0' },
            paths: {},
          } as never,
        },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}
