# AdPub

Aplicação web interna que transforma um **briefing** e uma pasta de criativos em **dezenas de
anúncios da Meta criados em lote — sempre `PAUSED`** —, com validação antes de publicar, fila
resiliente com retry e trilha de auditoria completa.
A IA sugere o plano do lote e as copies; **quem ativa, define orçamento e público é o gestor**.
Feito para ~80 anúncios/dia em 17 contas de uma mesma Business Manager.

- Especificação da feature: [`specs/001-mvp-publicacao-lote/`](specs/001-mvp-publicacao-lote/)
- Regras não negociáveis: [`memory/constitution.md`](memory/constitution.md)
- Visão de produto: [`PRD.md`](PRD.md)

## Mapa do monorepo

pnpm workspaces + Turborepo, TypeScript em Node 22.

### Aplicações

| Pacote | O que é |
|---|---|
| [`apps/web`](apps/web) | `@adpub/web` — Next.js (App Router + Server Actions). Telas `/` (lotes), `/contas`, `/clientes`, `/criativos`, `/lotes/novo`, `/lotes/[id]`, `/auditoria`, `/usuarios`, `/saude`. Funciona como BFF: fala só com a API (`src/lib/api.ts`), nunca com a Meta |
| [`apps/api`](apps/api) | `@adpub/api` — Fastify. Rotas em `/api/v1/*`, erros em `application/problem+json` (RFC 9457), OpenAPI, e o **produtor** das filas BullMQ |
| [`apps/worker`](apps/worker) | `@adpub/worker` — consumidores BullMQ: publicação (`adpub.publish`), sync da BM (`adpub.sync`), importação do Drive (`adpub.drive-import`) e poller de revisão (`adpub.status-poll`). **Único lugar do sistema que escreve na Meta** |

### Pacotes

| Pacote | O que é |
|---|---|
| [`packages/config`](packages/config) | Parsing de ambiente com zod (falha rápido se faltar segredo) e as constantes do produto: limites de copy, specs de mídia, retry, concorrência por tier, nomes de fila |
| [`packages/shared`](packages/shared) | Schemas zod compartilhados (fonte de verdade entre UI, API, worker e IA), enums, máquina de estados da publicação e o JSON Schema do tool use |
| [`packages/db`](packages/db) | Drizzle ORM + Postgres: schema, repositórios por entidade e migrações |
| [`packages/crypto`](packages/crypto) | AES-256-GCM para tokens, `mask()`/`redact()` para logs e auditoria, `appsecretProof()` e a `idempotencyKey` dos itens |
| [`packages/auth`](packages/auth) | Login Google restrito ao domínio corporativo e sessão JWT (`jose`) |
| [`packages/meta-client`](packages/meta-client) | Cliente da Graph API: leituras, escritas (importáveis só pelo worker), leitura dos headers de rate limit e classificação/tradução de erros |
| [`packages/ai`](packages/ai) | Anthropic: prompts versionados em `prompts/*.md`, tool use forçado, normalização da saída e custo por geração |
| [`packages/rules`](packages/rules) | Validação determinística: mídia, nomenclatura por template, UTM/URL, política de copy e a validação do item |
| [`packages/media`](packages/media) | `sharp` + `ffprobe`: dimensões, proporção, duração e miniaturas |
| [`packages/storage`](packages/storage) | Storage S3-compatível (MinIO no local) com URLs assinadas |
| [`packages/assets`](packages/assets) | Ingestão de criativo: valida, deduplica por SHA-256 e grava no storage + banco |

## Subir local

Pré-requisitos: Node ≥ 22, pnpm 11, Docker (Postgres, Redis e MinIO), `ffmpeg`/`ffprobe` no PATH
(usados por `packages/media`).

```bash
pnpm install
cp .env.example .env      # preencher MASTER_KEY, META_*, GOOGLE_*, ANTHROPIC_API_KEY, AUTH_SECRET

docker compose -f infra/docker-compose.yml up -d      # postgres, redis, minio

pnpm db:migrate
pnpm dev                  # web :3000, api :4000, worker
```

**Se a máquina já tem Postgres/Redis local**, suba a infra em portas alternativas e ajuste as URLs
do `.env`:

```bash
POSTGRES_PORT=55432 REDIS_PORT=56379 MINIO_PORT=59000 \
  docker compose -f infra/docker-compose.yml up -d
```

```dotenv
DATABASE_URL=postgres://adpub:adpub@localhost:55432/adpub
REDIS_URL=redis://localhost:56379
S3_ENDPOINT=http://localhost:59000
```

`MASTER_KEY` são 32 bytes em base64 (`openssl rand -base64 32`) e **não** mora no banco. O console do
MinIO sobe em `MINIO_CONSOLE_PORT` (9001 por padrão), com as credenciais do
`infra/docker-compose.yml`.

O passo a passo com o que precisa existir na Meta e no Google antes do primeiro login está em
[`specs/001-mvp-publicacao-lote/quickstart.md`](specs/001-mvp-publicacao-lote/quickstart.md).

## Scripts

Todos rodam da raiz do repositório.

| Script | O que faz |
|---|---|
| `pnpm build` | `turbo run build` — compila todos os pacotes e apps |
| `pnpm dev` | sobe web, api e worker em paralelo |
| `pnpm lint` | ESLint no monorepo (inclui a regra que proíbe escrita na Meta fora do worker) |
| `pnpm typecheck` | `tsc --noEmit` em cada pacote e app, mais `scripts/` e `e2e/` (`tsconfig.scripts.json`) |
| `pnpm test` / `pnpm test:watch` | Vitest: unidade + contrato com as fixtures gravadas da Graph API |
| `pnpm test:e2e` | Playwright: jornadas 1, 3 e 5 pela UI, com a Graph API falsa; usa banco/bucket próprios (`adpub_e2e`) e reconstrói o web a cada execução |
| `pnpm smoke:integration` | API + worker de verdade contra Postgres/Redis/MinIO locais, com uma Graph API falsa — nenhuma chamada externa. **Zera o banco**: só roda em loopback ou banco `*_test`/`*_e2e` (`ADPUB_ALLOW_TRUNCATE=1`, definido pelo próprio script) |
| `pnpm smoke:sandbox` | cria 2 anúncios `PAUSED` na conta de teste e arquiva tudo no fim (**exige token real**; token e app secret saem mascarados de qualquer log). **Zera o banco**, mesma guarda acima |
| `pnpm db:generate` | gera migração a partir do schema Drizzle |
| `pnpm db:migrate` | aplica as migrações |
| `pnpm format` | Prettier |

## Regras que o código impõe

Da [constituição do projeto](memory/constitution.md) — não são convenções, são barreiras:

1. **Escrita na Meta só pelo worker.** `@adpub/meta-client/write` é bloqueado por
   `no-restricted-imports` em `eslint.config.js` para tudo que não seja `apps/worker`. UI e API
   enfileiram job; ninguém chama a Graph API por fora.
2. **Tudo nasce `PAUSED`.** `createCampaign`, `createAdSet` e `createAd` mandam `status=PAUSED`
   fixo, e só objetivos `OUTCOME_*` são aceitos. Ativar é decisão humana no Ads Manager.
3. **Idempotência.** Cada item tem `idempotency_key` determinística e cada etapa persiste o ID
   devolvido pela Meta antes de avançar — reprocessar nunca duplica objeto.
4. **Teto diário por conta.** `DEFAULT_DAILY_AD_CAP` = 200, ajustável por conta; publicar exige
   confirmar a contagem exata de itens.
5. **Token cifrado.** AES-256-GCM com `MASTER_KEY` fora do banco, `appsecret_proof` em toda chamada,
   segredos mascarados em log e auditoria.
6. **Versão da API fixada e observável.** `META_API_VERSION` em toda URL; cada chamada registra
   endpoint, versão, latência, erro e uso de rate limit em `meta_api_calls`.
7. **Erro traduzido.** A Meta fala em código; a tela fala em português, com a resposta original
   disponível em "detalhes".

## Documentação

| Documento | Assunto |
|---|---|
| [`docs/spike-meta.md`](docs/spike-meta.md) | Runbook `curl` do spike na conta de teste e como regravar as fixtures |
| [`docs/erros-meta.md`](docs/erros-meta.md) | Mapa completo dos erros da Meta traduzidos e o que o pipeline faz em cada um |
| [`docs/meta-app-review.md`](docs/meta-app-review.md) | Checklist do App Review para Full Access, roteiro do screencast e registro da submissão |
| [`docs/migracao-v26.md`](docs/migracao-v26.md) | Plano de migração `v25.0` → `v26.0`, inventário de campos e rollback |
| [`docs/piloto-e-rollout.md`](docs/piloto-e-rollout.md) | Piloto de 2 gestores, medição de SC-003/SC-005, treinamento e rollout às 17 contas |

Da especificação:

| Documento | Assunto |
|---|---|
| [`specs/001-mvp-publicacao-lote/spec.md`](specs/001-mvp-publicacao-lote/spec.md) | Histórias de usuário, requisitos funcionais e critérios de sucesso |
| [`specs/001-mvp-publicacao-lote/plan.md`](specs/001-mvp-publicacao-lote/plan.md) | Arquitetura e Constitution Check |
| [`specs/001-mvp-publicacao-lote/data-model.md`](specs/001-mvp-publicacao-lote/data-model.md) | Modelo de dados |
| [`specs/001-mvp-publicacao-lote/contracts/api.openapi.yaml`](specs/001-mvp-publicacao-lote/contracts/api.openapi.yaml) | Contrato da API |
| [`specs/001-mvp-publicacao-lote/tasks.md`](specs/001-mvp-publicacao-lote/tasks.md) | Tarefas por história |

## Antes de abrir PR

`pnpm build`, `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes, nenhum segredo no diff e o
[`CHANGELOG.md`](CHANGELOG.md) atualizado. Mudança que toca o pipeline de publicação também exige
`pnpm smoke:sandbox` na conta de teste.

O CI (`.github/workflows/ci.yml`) roda scan de segredos, build, lint, typecheck, testes, scan de
token nos logs (SC-006), `pnpm smoke:integration` e `pnpm test:e2e`. A fumaça em conta real fica em
`.github/workflows/smoke.yml` (manual ou ao publicar release), com os `SMOKE_*` vindo de secrets.
