# Tarefas: MVP — Publicação em lote de anúncios Meta via IA

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api.openapi.yaml`, `quickstart.md`
**Convenções**: `[P]` = pode rodar em paralelo (arquivos diferentes, sem dependência); `[USn]` = história de usuário; caminhos relativos à raiz do repo. Testes de regras/máquina de estados são escritos **antes** da implementação (Constituição V).

---

## Fase 1 — Setup
- [ ] T001 Criar monorepo pnpm + Turborepo com `apps/web`, `apps/api`, `apps/worker`, `packages/{shared,db,meta-client,ai,rules,crypto,config}`; TypeScript strict, ESLint, Prettier
- [ ] T002 [P] `infra/docker-compose.yml` (postgres 16, redis 7, minio) e `.env.example` conforme `quickstart.md`
- [ ] T003 [P] `packages/config`: parser de env com zod (falha rápido se faltar `MASTER_KEY`, `META_API_VERSION`)
- [ ] T004 [P] CI `infra/github/workflows/ci.yml`: install, lint, typecheck, test, gitleaks (scan de segredos)
- [ ] T005 [P] `packages/db`: Drizzle + migração inicial com todas as tabelas de `data-model.md`
- [ ] T006 [P] Regra de lint `no-restricted-imports`: `packages/meta-client/write/*` só importável por `apps/worker` (Constituição I)
- [ ] T007 Spike documentado em `docs/spike-meta.md`: criar anúncio de imagem e de vídeo `PAUSED` em conta de teste via curl; salvar respostas como fixtures em `packages/meta-client/test/fixtures/`
- [ ] T008 Criar app Meta, System User, gerar token; **submeter App Review (Full access)** com screencast do spike — registrar data/protocolo em `docs/meta-app-review.md`

## Fase 2 — Fundação (bloqueia todas as histórias)
- [ ] T010 `packages/crypto`: `encrypt/decrypt` AES-256-GCM com `MASTER_KEY`, `mask(token)`; testes
- [ ] T011 `packages/shared`: schemas zod `Copy`, `ObjectRef`, `AdDraftInput`, `BatchPlan`, `ValidationReport`, enums de status/etapas; exportar JSON Schema para a IA
- [ ] T012 `packages/meta-client/client.ts`: `fetch` com versão fixa, `appsecret_proof`, timeout, parse de erro Graph, leitura de `X-Business-Use-Case-Usage`/`X-Ad-Account-Usage`, gravação em `meta_api_calls`
- [ ] T013 `packages/meta-client/errors.ts`: classificação transiente/não-transiente (R7) + mapa de tradução PT-BR; testes com fixtures
- [ ] T014 `packages/meta-client/read/*`: `getMe`, `listOwnedAdAccounts`, `listPages`, `listIgAccounts`, `listPixels`, `listCampaigns`, `listAdSets`, `getAdsStatus(ids[])` (batch ≤ 50)
- [ ] T015 `apps/api`: Fastify + `@fastify/swagger` a partir de `contracts/api.openapi.yaml`; plugin de sessão Auth.js; middleware RBAC + escopo por conta; erros RFC 9457
- [ ] T016 `apps/web`: Next.js + Auth.js Google restrito a `AUTH_ALLOWED_DOMAIN`; layout base; cliente HTTP tipado da API
- [ ] T017 `apps/worker`: bootstrap BullMQ com filas `import-drive`, `media-upload`, `publish`, `sync`, `status-poll`; `limiter` por `ad_account_id`; concorrência por `META_TIER`
- [ ] T018 `packages/db/repos/audit.ts`: `audit(actor, action, entity, before, after, metaReq?, metaRes?)` com mascaramento; helper usado por API e worker
- [ ] T019 Logger pino com redator (`access_token`, `appsecret_proof`, `Authorization`) + OpenTelemetry básico + Sentry

## Fase 3 — US1 Conectar a BM e sincronizar (P1) 🎯
### Testes
- [ ] T020 [P] [US1] Testes de contrato `packages/meta-client/test/read.test.ts` com fixtures de `/me`, `owned_ad_accounts`, `pages`, `adspixels`
- [ ] T021 [P] [US1] Teste de serviço: token inválido (código 190) → conexão `needs_attention` + filas pausadas + alerta
### Implementação
- [ ] T022 [US1] `apps/api/src/services/connections.ts`: criar (testar → cifrar → salvar), testar, listar; detecção de tier pelo header
- [ ] T023 [US1] `apps/worker/src/processors/sync.ts`: sincroniza contas, páginas, IGs, pixels, campanhas/conjuntos ativos → tabelas de cache; agenda a cada 6 h
- [ ] T024 [US1] Rotas `/connections*`, `/ad-accounts*` (GET, PATCH padrões) em `apps/api/src/routes/`
- [ ] T025 [US1] Telas `apps/web/app/(app)/contas/`: lista de conexões, formulário de token (write-only), status/tier, botão sincronizar, padrões por conta (página/IG/pixel/cliente/teto)
- [ ] T026 [US1] Alerta Slack/e-mail em token inválido ou conexão `needs_attention`

## Fase 4 — US6 Auditoria e permissões (P1)
- [ ] T030 [P] [US6] Testes de RBAC: manager sem escopo recebe 403 em `/ad-accounts/{id}`, `/batches?ad_account_id=`
- [ ] T031 [US6] Tela `apps/web/app/(app)/usuarios/`: papéis e escopo por conta (admin)
- [ ] T032 [US6] Rota `/audit` + tela `apps/web/app/(app)/auditoria/` com filtros por entidade/ator/período e visualização de payload mascarado
- [ ] T033 [US6] Teste automatizado no CI: grep de padrões de token nos logs de teste → falha se encontrar (SC-006)

## Fase 5 — US2 Importar e validar criativos (P1)
### Testes
- [ ] T040 [P] [US2] `packages/rules/test/media.test.ts`: tabela de specs (1:1, 4:5, 9:16, 16:9, 1.91:1; mínimo 600 px; vídeo até limite configurado) → ok/rejected com motivo
- [ ] T041 [P] [US2] Teste de dedupe por SHA-256 e reaproveitamento de `asset_uploads`
### Implementação
- [ ] T042 [US2] `packages/rules/media.ts`: detecção de proporção, validação, mensagens de correção
- [ ] T043 [US2] `apps/worker/src/processors/import-drive.ts`: `googleapis` listar recursivo, baixar, hash, `sharp`/ffprobe, salvar em S3, registrar `assets`, gerar thumbnail
- [ ] T044 [US2] Rota `POST /assets` (multipart) reutilizando o mesmo pipeline de validação
- [ ] T045 [US2] Rotas `GET /assets`, `POST /assets/import-drive`; SSE de progresso da importação
- [ ] T046 [US2] Tela `apps/web/app/(app)/biblioteca/`: grid com filtros, miniaturas, motivo de rejeição, botão importar pasta / upload

## Fase 6 — US3 Montar lote com IA (P1) 🎯
### Testes
- [ ] T050 [P] [US3] `packages/ai/test/plan.test.ts`: resposta da IA fora do schema é rejeitada; refs a criativos inexistentes viram `pending`; link ausente vira `pending`
- [ ] T051 [P] [US3] `packages/rules/test/naming.test.ts`: renderização do template com tokens; sugestão de nome
### Implementação
- [ ] T052 [US3] `packages/ai/prompts/plan.v1.md` (briefing → BatchPlan) e `copy.v1.md` (variações no perfil de voz); tool `submit_batch_plan` com `input_schema` = BatchPlan
- [ ] T053 [US3] `packages/ai/client.ts`: chamada Anthropic com tool use forçado, validação zod, cache por hash em `ai_generations`, registro de tokens/custo, timeout 40 s
- [ ] T054 [US3] `apps/api/src/services/batch-plan.ts`: monta contexto (conta, padrões, perfil de voz, campanhas/conjuntos em cache, assets), chama IA, cria/atualiza `ad_drafts`, calcula `idempotency_key`, aplica nomenclatura e UTM
- [ ] T055 [US3] Rotas `/batches` (POST/GET/PATCH), `/batches/{id}/plan`, `/batches/{id}/items*` com bloqueio otimista
- [ ] T056 [US3] Tela `apps/web/app/(app)/lotes/novo` e `lotes/[id]`: wizard (conta → criativos → briefing) e grade editável (copy, CTA, link, nome, campanha/conjunto, criativo), marcação "editada", pendências em destaque
- [ ] T057 [US3] Modo manual: formulário matriz criativos × copies gerando os mesmos `AdDraftInput`

## Fase 7 — US4 Validar antes de publicar (P1)
### Testes
- [ ] T060 [P] [US4] `packages/rules/test/validate.test.ts`: obrigatórios, domínio permitido, UTM auto, compatibilidade página/IG/formato, carrossel 2–10 cartões
- [ ] T061 [P] [US4] `packages/rules/test/policy.test.ts`: regex de atributos pessoais, antes/depois, promessa de resultado, CAPS > 30 %, termos proibidos do cliente
### Implementação
- [ ] T062 [US4] `packages/rules/validate.ts` + `policy.ts` (camada determinística)
- [ ] T063 [US4] `packages/ai/prompts/policy.v1.md` + classificador (modelo barato) retornando `{categoria, trecho, severidade}`
- [ ] T064 [US4] Rota `POST /batches/{id}/validate` → `ValidationReport`; atualiza `ad_drafts.status/validation`; respeita `clients.policy_mode`
- [ ] T065 [US4] UI: painel de validação por item, botão "aplicar nome sugerido", badge de política com trecho

## Fase 8 — US5 Publicar em fila com acompanhamento (P1) 🎯
### Testes
- [ ] T070 [P] [US5] `apps/worker/test/state-machine.test.ts`: transições válidas/inválidas; reprocessar retoma na etapa salva; 100 execuções com falha injetada → 0 duplicatas (SC-004)
- [ ] T071 [P] [US5] Teste de `batch_refs`: 5 itens com a mesma campanha nova → 1 criação
- [ ] T072 [P] [US5] Teste de rate limit: header ≥ 75 % reduz concorrência; erro 613 pausa fila da conta pelo tempo informado
### Implementação
- [ ] T073 [US5] `packages/meta-client/write/*`: `uploadImage`, `startVideoUpload/transfer/finish`, `getVideoStatus`, `createCampaign`, `createAdSet`, `createAdCreative` (imagem, vídeo, carrossel — R9), `createAd` (status forçado `PAUSED`)
- [ ] T074 [US5] `apps/worker/src/steps/`: `uploadMedia`, `ensureCampaign`, `ensureAdset`, `createCreative`, `createAd` — cada um idempotente, grava `meta_ids` e auditoria
- [ ] T075 [US5] `apps/worker/src/processors/publish.ts`: lê `step`, executa próxima etapa, trata erro (transiente → retry backoff+jitter; não transiente → `failed`), reagenda polling de vídeo
- [ ] T076 [US5] Interceptor de rate limit no cliente + controle de `paused_until`/concorrência por conta (R6)
- [ ] T077 [US5] `apps/worker/src/processors/status-poll.ts`: a cada 10 min, `effective_status`/`ad_review_feedback` dos anúncios dos últimos 7 dias
- [ ] T078 [US5] Rota `POST /batches/{id}/publish` (checa `ready`, teto diário, `confirm_count`, `only_failed`) + `GET /batches/{id}/events` (SSE)
- [ ] T079 [US5] Tela de acompanhamento em `lotes/[id]`: barra de progresso, etapa por item, erro traduzido + original, botão reprocessar falhos, link para Ads Manager (`https://adsmanager.facebook.com/adsmanager/manage/ads?act=...&selected_ad_ids=...`)
- [ ] T080 [US5] Alertas: lote com > 20 % de falha; conta pausada por rate limit > 15 min

## Fase 9 — US7 Duplicar lote (P2)
- [ ] T085 [US7] Serviço de duplicação com remapeamento (página/IG/pixel/domínio/UTM) e itens em `draft` com criativos marcados "precisa upload"
- [ ] T086 [US7] Rota `POST /batches/{id}/duplicate` + botão na UI

## Fase 10 — US8 Painel de saúde (P3)
- [ ] T090 [US8] Rota `GET /ad-accounts/{id}/health` agregando `meta_api_calls`, `rate_usage`, jobs pendentes
- [ ] T091 [US8] Tela `contas/[id]/saude`

## Fase 11 — Polish e transversal
- [ ] T095 [P] Playwright e2e das jornadas 1, 3 e 5 com Meta mockada (fixtures)
- [ ] T096 [P] `scripts/smoke-sandbox.ts`: cria 2 anúncios pausados na conta de teste e arquiva; roda no workflow `smoke.yml` antes de release
- [ ] T097 [P] Documentar em `docs/erros-meta.md` o mapa de erros traduzidos
- [ ] T098 Piloto com 2 gestores e 3 contas: coletar tempo por anúncio (SC-005) e taxa de intervenção (SC-003); ajustar prompts
- [ ] T099 Plano de migração `v25.0 → v26.0` (spec futura) com checklist de campos deprecados
- [ ] T100 Rollout às 17 contas; treinamento de 30 min; métricas O1–O6 no painel

---

## Dependências e ordem
- Fase 1 → Fase 2 → (US1 e US6 em paralelo) → US2 → US3 → US4 → US5 → US7/US8 → Polish.
- US3 depende de US2 (assets) e US1 (cache de campanhas/conjuntos).
- US5 depende de US4 (só publica `ready`) e de T073–T076.
- T008 (App Review) deve começar na Fase 1: o pipeline funciona no tier Limited, mas o rollout às 17 contas depende do Full access.

## Exemplo de paralelismo
Após a Fase 2, três desenvolvedores podem tocar simultaneamente: (a) T020–T026 US1, (b) T040–T046 US2, (c) T030–T033 US6 + T010–T013 de reforço nos pacotes.

## Estratégia de implementação
1. **MVP mínimo demonstrável** = Fase 1 + 2 + US1 + US2 + US3 (sem política IA) + US5 para imagem única. Demonstrar em conta de teste.
2. Adicionar vídeo e carrossel, validação de política, US4 completo.
3. US6 completo, US7, US8, piloto, rollout.
