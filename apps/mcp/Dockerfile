# syntax=docker/dockerfile:1.7
#
# Imagem de produção do servidor MCP. O contexto é a raiz do repositório:
#   docker build -f apps/mcp/Dockerfile -t adpub-mcp .
#
# Mesmo esquema da API: `pnpm deploy` monta /out com o pacote @adpub/mcp já
# resolvido (dist + node_modules de produção, pacotes do workspace incluídos).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@adpub/mcp
# `--legacy`: o workspace não usa inject-workspace-packages (o deploy padrão do
# pnpm >= 10 exige a flag).
RUN pnpm --filter @adpub/mcp deploy --prod --legacy /out

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=build /out/dist ./dist
COPY --chown=node:node --from=build /out/package.json ./package.json
COPY --chown=node:node --from=build /out/node_modules ./node_modules
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.MCP_PORT ?? 4100}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
