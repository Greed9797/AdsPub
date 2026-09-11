# syntax=docker/dockerfile:1.7
#
# Imagem de produção da API. O contexto é a raiz do repositório:
#   docker build -f apps/api/Dockerfile -t adpub-api .
#
# O `pnpm deploy` monta /out com o pacote @adpub/api já resolvido (dist +
# node_modules de produção, pacotes do workspace incluídos), então o runtime
# não precisa do monorepo.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@adpub/api
# `--legacy`: o workspace não usa inject-workspace-packages (o deploy padrão do
# pnpm >= 10 exige a flag).
RUN pnpm --filter @adpub/api deploy --prod --legacy /out

FROM base AS runner
ENV NODE_ENV=production
# ffprobe/ffmpeg: dimensões e miniatura de vídeo na ingestão (packages/media).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Só o necessário: os prompts de IA e as migrações vêm dentro dos respectivos
# pacotes em node_modules (@adpub/ai/prompts, @adpub/db/migrations).
COPY --chown=node:node --from=build /out/dist ./dist
COPY --chown=node:node --from=build /out/package.json ./package.json
COPY --chown=node:node --from=build /out/node_modules ./node_modules
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT ?? 4000}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
