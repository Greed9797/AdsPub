# Plano de Implementação: MVP — Publicação em lote de anúncios Meta via IA

**Branch**: `001-mvp-publicacao-lote` | **Data**: 2026-09-08 | **Spec**: `spec.md`
**Input**: `spec.md`, `PRD.md`, `research/analise-open-source.md`, `memory/constitution.md`

## Resumo
Aplicação web interna em monorepo TypeScript: Next.js (UI + BFF) → API (Fastify) → workers BullMQ que executam uma máquina de estados por anúncio contra a Graph API v25.0 usando o System User da BM. A IA (Anthropic API, tool use com schemas zod) produz o `BatchPlan`; a UI edita; o validador bloqueia/avisa; o pipeline publica com `PAUSED`, idempotência, retry e controle de rate limit por conta; um poller atualiza o status de revisão.

## Contexto técnico
| Item | Decisão |
|---|---|
| **Linguagem/Versão** | TypeScript 5.x / Node 22 LTS |
| **Dependências principais** | Next.js (App Router), Fastify + `@fastify/swagger`, BullMQ, Drizzle ORM, zod, Auth.js (Google), `googleapis`, `sharp`, `fluent-ffmpeg`/ffprobe, `@anthropic-ai/sdk`, pino, OpenTelemetry, Sentry |
| **Armazenamento** | Postgres 16 (Supabase compatível); Redis 7 (BullMQ, cache curto); Storage S3-compatível (R2/Supabase Storage) |
| **Testes** | Vitest (unit + contrato), Playwright (e2e das jornadas 1, 3, 5), fixtures gravadas da Graph API, suíte de fumaça contra conta sandbox |
| **Plataforma alvo** | Web (desktop, Chrome/Edge). Deploy: Vercel (web) + Railway/Fly (api, worker) ou tudo em um VPS com Docker Compose |
| **Tipo de projeto** | Monorepo web (pnpm workspaces + Turborepo) |
| **Metas de performance** | Briefing→plano P95 ≤ 40 s; 20 anúncios P95 ≤ 5 min; UI < 200 ms nas listas |
| **Restrições** | Constituição I–VII; `META_API_VERSION=v25.0`; sem PII de consumidores; tier Limited durante o desenvolvimento |
| **Escala/escopo** | 17 contas → 100; 80 → 800 anúncios/dia; ~8 telas; 3 formatos de anúncio |

## Constitution Check
| Artigo | Como o plano atende |
|---|---|
| I. Escrita só pelo pipeline | Endpoints de escrita da Meta existem apenas em `apps/worker`; `packages/meta-client` exporta `write*` sob um namespace importável só pelo worker (lint rule `no-restricted-imports`). |
| II. Pausado/confirmado/limitado | `status` forçado a `PAUSED` no `createAd`; ativação é feature separada (fora do MVP); teto por lote/conta em `ad_accounts.daily_ad_cap`. |
| III. Idempotência | `ad_drafts.meta_ids` (jsonb) com ID por etapa; `idempotency_key` = `hash(batch_id, position, creative_id, copy_hash)`; locks em `batch_refs` para campanhas/conjuntos "novos". |
| IV. Segredos | `packages/crypto` (AES-256-GCM, chave `MASTER_KEY` via env/cofre); redator de logs pino; `appsecret_proof` no cliente. |
| V. Contratos e testes primeiro | `packages/shared` com schemas zod; regras em `packages/rules` com testes antes; contrato Meta com fixtures. |
| VI. Versão fixada | `META_API_VERSION` obrigatório; interceptor registra `meta_api_calls`. |
| VII. Simplicidade | Sem Temporal; BullMQ + máquina de estados em Postgres. Erros traduzidos em `packages/meta-client/errors.ts`. |

**Violações**: nenhuma.

## Estrutura do projeto

### Documentação (esta feature)
```
specs/001-mvp-publicacao-lote/
├── spec.md
├── plan.md
├── research.md          # decisões técnicas e alternativas
├── data-model.md        # entidades, estados, índices
├── contracts/
│   └── api.openapi.yaml # contrato REST da API interna
├── quickstart.md        # subir local + briefing de exemplo
└── tasks.md
```

### Código-fonte (raiz do repositório)
```
apps/
├── web/                 # Next.js: telas, BFF (route handlers chamam a API)
│   └── app/(app)/{contas,clientes,biblioteca,lotes,auditoria}/
├── api/                 # Fastify: REST + OpenAPI, auth, RBAC, orquestra IA e validação
│   └── src/{routes,services,plugins}/
└── worker/              # BullMQ: import-drive, media-upload, publish, sync, status-poll
    └── src/{queues,processors,steps}/
packages/
├── shared/              # zod schemas (BatchPlan, AdDraft, Copy, Validation), tipos, enums
├── db/                  # Drizzle schema, migrações, repositórios
├── meta-client/         # cliente Graph API: fetch, appsecret_proof, rate-limit headers, erros traduzidos, read/* e write/*
├── ai/                  # prompts versionados, tool schemas, chamadas Anthropic, cache
├── rules/               # validação determinística: mídia, URL/UTM, nomenclatura, política (regex), compatibilidade
├── crypto/              # cifra de tokens, mascaramento
└── config/              # env parsing (zod), constantes (limites de copy, specs de mídia)
infra/
├── docker-compose.yml   # postgres, redis, minio
└── github/workflows/    # ci.yml (lint, test, secret-scan), smoke.yml (conta sandbox)
```

## Fases de implementação

### Fase 0 — Setup e spike (semana 1–2)
- Monorepo, CI, Docker Compose, Drizzle, Auth.js.
- Spike em conta de teste: upload imagem → criativo → anúncio; upload vídeo em chunks → aguardar `ready` → criativo → anúncio. Gravar fixtures.
- Criar app Meta, System User, **submeter App Review** (Full Access) com screencast do spike.

### Fase 1 — Fundação (US1, US6)
Conexão/cofre, sync de ativos, RBAC, auditoria base, painel de contas.

### Fase 2 — Criativos (US2)
Importação Drive/upload, validação de mídia, dedupe, cache de upload por conta.

### Fase 3 — Lote e IA (US3, US4)
Schemas `BatchPlan`, prompts, grade editável, validador, nomenclatura, UTM.

### Fase 4 — Publicação (US5)
Filas, máquina de estados, cliente de escrita, rate limit, retry, poller de status, reprocessamento, tela de acompanhamento.

### Fase 5 — Piloto e polish (US7, US8)
Duplicar lote, painel de saúde, alertas, e2e, fumaça, rollout.

## Riscos técnicos e resposta
| Risco | Resposta |
|---|---|
| Tier Limited durante o dev (300 chamadas/h/conta) | Concorrência 1 por conta; cache agressivo de reads; usar 2–3 contas de teste. |
| Processamento de vídeo lento na Meta | Etapa `UPLOADING_MEDIA` com polling assíncrono (job re-agendado), não bloqueante. |
| Mudança v26 | `META_API_VERSION` + suíte de contrato; task de migração já prevista. |
| Custo/latência da IA | Modelo mais barato para validação; geração em paralelo por criativo; cache por hash de entrada. |

## Rastreamento de complexidade
Nenhuma exceção à constituição solicitada.
