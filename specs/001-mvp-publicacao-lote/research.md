# Research — decisões técnicas da feature 001

Cada decisão: **Decisão / Racional / Alternativas consideradas**. Fontes de plataforma em `research/analise-open-source.md` §6.

## R1 — Cliente Graph API próprio vs. SDK oficial
- **Decisão**: cliente fino próprio (`packages/meta-client`) sobre `fetch`, com tipos zod para os objetos usados (AdAccount, Page, Campaign, AdSet, AdCreative, Ad, AdImage, AdVideo), `appsecret_proof`, versão fixa e leitura de `X-Business-Use-Case-Usage`/`X-Ad-Account-Usage`.
- **Racional**: SDKs são autogerados e pesados; precisamos de controle fino de headers, retries e tradução de erros. Payloads copiados dos SDKs/MCPs.
- **Alternativas**: `facebook-nodejs-business-sdk` (usar apenas como referência); MCP oficial (OAuth por usuário, sem UI própria).

## R2 — Credencial: System User da BM
- **Decisão**: um System User (admin) na BM com acesso a todas as contas, páginas e IGs; token gerado com `ads_management`, `business_management`, `pages_read_engagement`, `pages_manage_ads`; cifrado em repouso; rotação trimestral mesmo sem expiração.
- **Racional**: pipeline roda sem usuário logado; uma credencial auditável.
- **Alternativas**: OAuth por gestor (tokens de 60 dias, atribuição de ativos por pessoa — frágil); token de app (não serve para ads).

## R3 — App Review / tier
- **Decisão**: submeter Full Access na semana 1 com screencast do spike; desenvolver no tier Limited com 2–3 contas; feature flag `META_TIER` ajusta concorrência.
- **Racional**: Limited é "somente desenvolvimento", sem gestão de BM, e 300 + 40×ativos chamadas/h/conta.

## R4 — Fila e máquina de estados
- **Decisão**: BullMQ com filas `import-drive`, `media-upload`, `publish`, `sync`, `status-poll`; **um job por AdDraft**; etapa atual persistida em `ad_drafts.step`; cada etapa é uma função pura `(draft, ctx) => Promise<StepResult>` que grava o ID retornado antes de avançar.
- **Racional**: reprocessar = re-enfileirar o mesmo job; ele lê `step` e continua. Sem workflow engine.
- **Alternativas**: Trigger.dev/Inngest (reavaliar na Release 2); Temporal (excesso).

## R5 — Idempotência e locks
- **Decisão**: `idempotency_key` determinístico por item; tabela `batch_refs (batch_id, ref_key, kind, meta_id)` com `INSERT ... ON CONFLICT` como lock para campanhas/conjuntos "novos" compartilhados por vários itens; mídia por `(asset_id, ad_account_id)` único.
- **Racional**: garantir que N itens referenciando a mesma campanha nova criem uma só.

## R6 — Rate limit e concorrência
- **Decisão**: BullMQ `limiter` por conta (group key = `ad_account_id`), concorrência padrão 3 (Full) / 1 (Limited). Interceptor lê headers; ≥ 75 % → concorrência 1; erro 17/32/613/80004 → pausar fila da conta por `estimated_time_to_regain_access` (ou backoff crescente se ausente).
- **Racional**: limites são por conta e por caso de uso; 80/dia cabe com folga, mas picos e o tier Limited exigem controle.

## R7 — Classificação de erros
- **Transientes (retry)**: códigos 1, 2, 4, 17, 32, 613, 80004; HTTP 5xx; timeouts.
- **Não transientes (FAILED)**: 100 (parâmetro inválido), 190 (token — além disso pausa tudo e alerta), 200/10 (permissão), subcódigos 1487xxx (criativo/imagem), 2635, 1885xxx.
- **Tradução**: mapa `{code, subcode} → {titulo, acao_sugerida}` em `errors.ts`, com fallback para `error_user_msg`.

## R8 — Upload de mídia
- **Imagem**: `POST /act_{id}/adimages` (multipart ou `bytes` base64) → `images[name].hash`. Uma vez por (asset, conta).
- **Vídeo**: `POST /act_{id}/advideos` com upload retomável (`upload_phase=start|transfer|finish`, chunks ~4–8 MB) → `video_id`; poller consulta `/{video_id}?fields=status` até `video_status=ready` (timeout 20 min → FAILED reprocessável).
- **Thumbnail**: para vídeo, usar `image_hash` de frame extraído com ffmpeg (1º segundo) ou deixar a Meta escolher.

## R9 — Criativos por formato
| Formato | Payload |
|---|---|
| Imagem única | `object_story_spec.link_data { image_hash, link, message, name, description, call_to_action }` |
| Vídeo único | `object_story_spec.video_data { video_id, image_hash, title, message, link_description, call_to_action{type,value{link}} }` |
| Carrossel | `object_story_spec.link_data { child_attachments:[{image_hash|video_id, link, name, description}], link, message, multi_share_optimized }` |
| Todos | `page_id`, `instagram_user_id` (se houver), `url_tags` (UTM), `degrees_of_freedom_spec.creative_features_spec` (controle de melhorias Advantage+ — padrão: opt-out configurável por cliente) |
- `asset_feed_spec` (múltiplos textos/títulos, personalização por posicionamento) entra na Release 2.

## R10 — Objetivos e Advantage+
- **Decisão**: só `OUTCOME_SALES | OUTCOME_LEADS | OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT`; conjuntos com `targeting` explícito **ou** `targeting_automation.advantage_audience=1`; nunca ASC/AAC legados.
- **Racional**: bloqueio da Meta desde 19/05/2026; v26 deve pausar legados.

## R11 — Status de revisão
- **Decisão**: poller a cada 10 min para anúncios publicados nos últimos 7 dias: `GET /{ad_id}?fields=effective_status,ad_review_feedback,configured_status`, em batch de até 50 IDs.
- **Alternativa**: webhook de ad account (`with_issues_ad_objects`) — avaliar na Release 2.

## R12 — IA
- **Decisão**: Anthropic API com *tool use* forçado a um único tool cujo `input_schema` é o `BatchPlan` (zod → JSON Schema). Prompts versionados em `packages/ai/prompts/*.md` com `prompt_version`; modelo de geração configurável (padrão: Sonnet atual), modelo de classificação de política (padrão: Haiku atual). Cache por `sha256(prompt_version + input)`. Sem *streaming* no MVP.
- **Racional**: saída validada, custo previsível, reprodutibilidade.
- **Docs**: https://docs.claude.com/en/api/overview

## R13 — Validação de política
- **Decisão**: duas camadas — regras determinísticas (`packages/rules/policy.ts`: regex para "você é/tem…", "antes e depois", "% garantido", CAPS > 30 %, `!!!`, lista por cliente) + classificador IA que devolve `{categoria, trecho, severidade}`. Cliente escolhe se aviso bloqueia.
- **Racional**: reduzir reprovações sem depender só do modelo.

## R14 — Nomenclatura e UTM
- **Decisão**: template por cliente com tokens `{cliente} {conta} {objetivo} {data:YYYYMMDD} {criativo} {formato} {v}`; UTM padrão por cliente aplicado via `url_tags` (não na URL) para não quebrar links.

## R15 — Google Drive
- **Decisão**: conta de serviço do Workspace com acesso de leitura às pastas compartilhadas; `drive.files.list` recursivo + `files.get(alt=media)`; limite 500 MB/arquivo.
- **Alternativa**: OAuth por gestor — mais atrito.

## R16 — Auth e RBAC
- **Decisão**: Auth.js com Google, restrição por domínio; papéis em `users.role`; escopo em `user_ad_accounts`. Middleware na API valida papel + conta em toda rota.

## R17 — Observabilidade
- **Decisão**: pino JSON com redator (`access_token`, `appsecret_proof`); tabela `meta_api_calls` (endpoint, versão, latência, status, código, uso de rate limit); métricas de fila via BullMQ events; alertas Slack para: token inválido, conta bloqueada por rate limit > 15 min, lote com > 20 % de falha.
