# syntax=docker/dockerfile:1.7
#
# Imagem de produção do web (Next.js standalone — ver `output` no
# next.config.ts). O contexto é a raiz do repositório:
#   docker build -f apps/web/Dockerfile -t adpub-web .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# `NEXT_STANDALONE=1` liga o output standalone (ver next.config.ts); dev, e2e e
# CI continuam no `next start`.
RUN NEXT_STANDALONE=1 pnpm exec turbo run build --filter=@adpub/web

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    # O Docker exporta HOSTNAME com o id do container; o Next usaria esse valor.
    HOSTNAME=0.0.0.0
WORKDIR /app
# O standalone traz server.js + node_modules rastreado; os estáticos ficam fora.
COPY --chown=node:node --from=build /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=build /app/apps/web/.next/static ./apps/web/.next/static
# (não existe public/ hoje; se passar a existir, copie para ./apps/web/public)
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
