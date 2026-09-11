# syntax=docker/dockerfile:1.7
#
# Imagem de produção do worker (fila BullMQ — único processo que escreve na
# Meta). O contexto é a raiz do repositório:
#   docker build -f apps/worker/Dockerfile -t adpub-worker .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@adpub/worker
RUN pnpm --filter @adpub/worker deploy --prod --legacy /out

FROM base AS runner
ENV NODE_ENV=production
# ffprobe/ffmpeg: importação do Drive e miniatura/duração de vídeo.
# `googleapis` (pacote já instalado) fala com o Drive sem binário extra.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node --from=build /out/dist ./dist
COPY --chown=node:node --from=build /out/package.json ./package.json
COPY --chown=node:node --from=build /out/node_modules ./node_modules
USER node
# Sem porta: o worker é consumidor de fila. O restart do compose é o watchdog.
CMD ["node", "dist/index.js"]
