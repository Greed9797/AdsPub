# Plano de migração da Graph API `v25.0` → `v26.0` (T099)

Constituição VI: "a versão da Graph API é uma configuração única (`META_API_VERSION`), presente em
toda URL… migração de versão é uma feature com spec própria". Este documento é o checklist que
essa spec vai executar.

**Prazo esperado**: `v26.0` prevista para ~set/2026 (`research/analise-open-source.md` §3 e
`PRD.md` §"Versão"). A Meta mantém cada versão por cerca de dois anos; `v23.0` foi encerrada em
jun/2026. Regra do time: migrar até **90 dias antes** do fim de vida da `v25.0`, nunca no mês do
desligamento.

## 1. Como a versão é fixada hoje

| Camada | O que faz |
|---|---|
| `.env` / `.env.example` | `META_API_VERSION=v25.0` |
| `packages/config/src/env.ts` | valida com `regex(/^v\d+\.\d+$/, 'META_API_VERSION deve ser como v25.0')`; sem default — falta da variável derruba o processo no boot |
| `packages/meta-client/src/client.ts` | o construtor de `MetaClient` repete a checagem e lança `META_API_VERSION inválida: <valor>`; `url()` monta **toda** URL como `${baseUrl}/${version}/${path}` |
| `apps/api/src/index.ts`, `apps/worker/src/meta.ts`, `scripts/smoke-sandbox.ts`, `scripts/smoke-integration.ts` | passam `env.META_API_VERSION` ao cliente — nenhum deles escreve a versão à mão |
| `meta_api_calls.api_version` | cada chamada registra a versão usada (`MetaClient.log()`), então dá para provar em que versão cada objeto nasceu |
| `GET /api/v1/health` | expõe `meta_api_version` para conferir o que está no ar |
| `.github/workflows/ci.yml` | `META_API_VERSION: v25.0` no job de verificação |

Onde a string `v25.0` está **literal** no código (precisa de edição manual na migração):

- `packages/meta-client/test/helpers.ts` — `makeClient()` usa `version: 'v25.0'`;
- `packages/meta-client/test/read.test.ts` — regex de rota (`/\/v25\.0\/me\?/`,
  `/graph\.facebook\.com\/v25\.0\/$/`) e a asserção `apiVersion: 'v25.0'`;
- `packages/meta-client/test/errors.test.ts` — `endpoint: '/v25.0/act_1/ads'`;
- `packages/crypto/test/crypto.test.ts` — URL de exemplo no teste de redação de segredo;
- `.env.example`, `.github/workflows/ci.yml` e o bloco de env do
  `specs/001-mvp-publicacao-lote/quickstart.md`.

## 2. Inventário de endpoints e campos usados hoje

Se a Meta mexer em qualquer linha desta tabela na `v26.0`, é trabalho de migração. Fonte:
`packages/meta-client/src/read/index.ts` e `packages/meta-client/src/write/index.ts`.

### Leituras (`src/read/index.ts`)

| Função | Endpoint | Campos / parâmetros |
|---|---|---|
| `getMe` | `GET /me` | `fields=id,name` |
| `listOwnedAdAccounts` | `GET /<business_id>/owned_ad_accounts` | `fields=id,account_id,name,currency,timezone_name,account_status`, `limit=100`, cursor `after` |
| `listClientAdAccounts` | `GET /<business_id>/client_ad_accounts` | mesmos campos |
| `listPages` | `GET /<business_id>/owned_pages` | `fields=id,name,instagram_business_account{id,username}` |
| `listIgAccounts` | `GET /<business_id>/owned_instagram_accounts` | `fields=id,username` |
| `listPixels` | `GET act_<id>/adspixels` | `fields=id,name` |
| `listAccountPages` | `GET act_<id>/promote_pages` | `fields=id,name,instagram_business_account{id,username}` |
| `listCampaigns` | `GET act_<id>/campaigns` | `fields=id,name,objective,status,effective_status,special_ad_categories`, filtro `effective_status=["ACTIVE","PAUSED"]` |
| `listAdSets` | `GET act_<id>/adsets` | `fields=id,name,campaign_id,optimization_goal,billing_event,destination_type,promoted_object,status,effective_status`, mesmo filtro |
| `getAdAccount` | `GET act_<id>` | `fields=id,account_id,name,currency,timezone_name,account_status,amount_spent` |
| `getAdsStatus` | `POST /` (batch, até `GRAPH_BATCH_MAX` = 50) | `relative_url=<ad_id>?fields=effective_status,configured_status,ad_review_feedback`, `include_headers=false` |

Paginação: `readAllPages()` usa `paging.cursors.after` + `paging.next`, teto de 20 páginas.

### Escritas (`src/write/index.ts`)

| Função | Endpoint | Campos enviados |
|---|---|---|
| `uploadImage` | `POST act_<id>/adimages` (multipart) | `source`; lê `images.<arquivo>.hash` |
| `startVideoUpload` | `POST act_<id>/advideos` | `upload_phase=start`, `file_size`; lê `upload_session_id`, `video_id`, `start_offset`, `end_offset` |
| `transferVideoChunk` | `POST act_<id>/advideos` (multipart) | `upload_phase=transfer`, `upload_session_id`, `start_offset`, `video_file_chunk` |
| `finishVideoUpload` | `POST act_<id>/advideos` | `upload_phase=finish`, `upload_session_id`, `title`, `description` |
| `getVideoStatus` | `GET /<video_id>` | `fields=status` → `status.video_status`, `status.processing_progress` |
| `createCampaign` | `POST act_<id>/campaigns` | `name`, `objective` (só `OUTCOME_SALES\|OUTCOME_LEADS\|OUTCOME_TRAFFIC\|OUTCOME_ENGAGEMENT`), `status=PAUSED`, `buying_type=AUCTION`, `special_ad_categories`, `daily_budget`, `lifetime_budget` |
| `createAdSet` | `POST act_<id>/adsets` | `name`, `campaign_id`, `status=PAUSED`, `optimization_goal`, `billing_event`, `targeting` (`geo_locations.countries`, `targeting_automation.advantage_audience`), `daily_budget`, `start_time`, `end_time`, `promoted_object` (`pixel_id`, `custom_event_type=PURCHASE`) |
| `createAdCreative` | `POST act_<id>/adcreatives` | `name`, `object_story_spec`, `degrees_of_freedom_spec`, `url_tags` |
| `createAd` | `POST act_<id>/ads` | `name`, `adset_id`, `creative={creative_id}`, `status=PAUSED` |
| `archiveAd` / `archiveCampaign` | `POST /<id>` | `status=ARCHIVED` |

Detalhe do `object_story_spec` (`src/write/creative-payload.ts`) — a parte mais sensível a mudança
de versão:

| Formato | Chaves |
|---|---|
| `single_image` | `page_id`, `instagram_user_id`, `link_data{image_hash, link, message, name, description, caption, call_to_action{type,value.link}}` |
| `single_video` | `page_id`, `instagram_user_id`, `video_data{video_id, image_hash, title, message, link_description, call_to_action}` |
| `carousel` | `link_data{link, message, name, description, multi_share_optimized, multi_share_end_card, call_to_action, child_attachments[]{link,name,description,image_hash\|video_id,call_to_action}}` |
| todos | `degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status` = `OPT_IN`/`OPT_OUT` |

### Headers de rate limit (`src/rate-limit.ts`)

`X-Business-Use-Case-Usage`, `X-App-Usage`, `X-Ad-Account-Usage`; campos lidos: `call_count`,
`total_cputime`, `total_time`, `estimated_time_to_regain_access`, `ads_api_access_tier`,
`acc_id_util_pct`. Mudança de nome ou de formato aqui quebra a pausa automática de fila — é o
segundo ponto mais sensível depois do criativo.

## 3. Procedimento de migração

1. **Ler o changelog da versão** e a lista de deprecações da Meta; anotar, item a item, o que
   toca a tabela da §2. O que não estiver na tabela não afeta o produto.
2. **Branch e spec** — `specs/NNN-migracao-v26/spec.md` (Constituição VI: migração é feature com
   spec própria).
3. **Subir a versão em ambiente de teste**: `META_API_VERSION=v26.0` no `.env` do ambiente de teste
   (não em produção). Nenhuma outra mudança de código no primeiro passo — a maior parte das
   migrações passa direto.
4. **Rodar a bateria local**, nesta ordem:
   ```bash
   pnpm build
   pnpm lint
   pnpm typecheck
   pnpm test                # unit + contrato (fixtures gravadas)
   pnpm test:e2e            # jornadas com a Meta mockada
   pnpm smoke:integration   # API + worker ponta a ponta, Graph API falsa
   ```
   `pnpm test` vai falhar nos pontos que fixam `v25.0` (§1) — atualize as strings dos testes; isso é
   esperado e é o próprio sinal de que a versão está mesmo fixada.
5. **Rodar o smoke real** contra a conta de teste, que é o único passo que fala com a Meta de
   verdade:
   ```bash
   SMOKE_META_TOKEN=... SMOKE_AD_ACCOUNT_ID=act_... SMOKE_PAGE_ID=... pnpm smoke:sandbox
   ```
   Ele cria um anúncio de imagem e um de vídeo `PAUSED` e arquiva tudo no fim.
6. **Comparar as fixtures**: refazer o `docs/spike-meta.md` na `v26.0` e comparar cada resposta com o
   arquivo correspondente em `packages/meta-client/test/fixtures/` (`diff <(jq -S . novo.json) <(jq -S . fixture.json)`).
   - Campo que **sumiu** e o produto lia → adaptar `read/index.ts` ou `write/index.ts` e regravar a
     fixture.
   - Campo **novo** que o produto ignora → não mexer; anotar na spec.
   - Campo **renomeado** → adaptar e registrar na tabela da §2.
7. **Conferir os erros**: repetir os casos de `docs/erros-meta.md` §"Erros a provocar de propósito".
   Códigos/subcódigos novos entram em `TRANSLATIONS` (`packages/meta-client/src/errors.ts`) e na
   tabela do `docs/erros-meta.md` no mesmo commit.
8. **Atualizar o resto**: `.env.example`, `.github/workflows/ci.yml`, o bloco de env do
   `specs/001-mvp-publicacao-lote/quickstart.md`, `docs/spike-meta.md` (`export API=`) e o
   `CHANGELOG.md`.
9. **Publicar** com `META_API_VERSION=v26.0` só depois de um lote real de teste sair verde em
   staging.

## 4. Checklist de campos a verificar na `v26.0`

- [ ] `OUTCOME_*` continuam sendo os objetivos válidos (FR-020 e o guarda em `createCampaign`).
- [ ] `targeting_automation.advantage_audience` mantém o formato `0/1`.
- [ ] `promoted_object.custom_event_type=PURCHASE` continua aceito com `OFFSITE_CONVERSIONS`.
- [ ] `degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status` não foi
      renomeado (é o opt-out de Advantage+ do cliente).
- [ ] `object_story_spec.instagram_user_id` continua sendo a chave do IG (e não `instagram_actor_id`).
- [ ] Upload de vídeo em três fases (`start`/`transfer`/`finish`) segue disponível em `advideos`.
- [ ] `promote_pages` e `adspixels` continuam sob `act_<id>`.
- [ ] `effective_status` como filtro de listagem aceita `["ACTIVE","PAUSED"]`.
- [ ] Batch continua limitado a 50 requisições (`GRAPH_BATCH_MAX`).
- [ ] Headers de uso mantêm nome e formato (§2).
- [ ] `ad_review_feedback` mantém o formato lido pelo poller (`apps/worker/src/poll/status.ts`).

## 5. Critérios de aceite da migração

- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` e
  `pnpm smoke:integration` verdes com `META_API_VERSION=v26.0`.
- `pnpm smoke:sandbox` cria e arquiva os dois anúncios sem erro.
- Nenhuma fixture alterada sem uma linha correspondente na spec explicando o que a Meta mudou.
- `meta_api_calls` do ambiente de teste mostra `api_version = v26.0` em 100 % das chamadas do
  período.

## 6. Rollback

A versão não é persistida em nenhum objeto do produto: campanhas, conjuntos, criativos e anúncios já
criados são identificados por ID e não pertencem a uma versão de API. Então o rollback é trivial:

1. `META_API_VERSION=v25.0` no ambiente afetado.
2. Reiniciar API e worker (o `MetaClient` é construído por processo/job, sem cache de versão).
3. Reprocessar os itens que ficaram em `failed` durante a janela ruim
   (`POST /api/v1/batches/:id/items/:itemId/retry`) — a idempotência garante que nada é duplicado
   (Constituição III).
4. Reverter as mudanças de código da migração (fixtures e tabelas de campos) no mesmo PR de
   rollback.

**Gatilhos para acionar rollback**: erro de código `2635` (versão/tipo descontinuado) em qualquer
conta, mais de 5 % das chamadas com erro permanente novo em `meta_api_calls`, ou qualquer item
publicado com `status` diferente de `PAUSED` (violação da Constituição II — rollback imediato e
incidente).
