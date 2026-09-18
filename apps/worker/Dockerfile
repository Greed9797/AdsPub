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

FROM base AS runtime-base
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

# Alvo Go: instala a CLI OpenCode pinada (etapa 3: 1.18.30) para análise de
# mídia via Muse. `prepare` informa versão+checksum; sem eles o build falha.
FROM runtime-base AS runner-opencode
ARG OPENCODE_VERSION
ARG OPENCODE_SHA256
USER root
RUN set -e; \
  test -n "$OPENCODE_VERSION" || { echo "FALHOU: OPENCODE_VERSION ausente" >&2; exit 1; }; \
  test -n "$OPENCODE_SHA256" || { echo "FALHOU: OPENCODE_SHA256 ausente" >&2; exit 1; }; \
  apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*; \
  curl -fsSL -o /tmp/opencode.tar.gz "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz"; \
  echo "${OPENCODE_SHA256}  /tmp/opencode.tar.gz" | sha256sum -c -; \
  tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin opencode; \
  rm -f /tmp/opencode.tar.gz; \
  chmod +x /usr/local/bin/opencode
USER node
RUN test -x /usr/local/bin/opencode && /usr/local/bin/opencode --version

# Alvo padrão: igual ao runtime-base, sem CLI e sem build args externos.
FROM runtime-base AS runner
