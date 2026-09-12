# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue
[Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado (criativos: vídeo de ponta a ponta)

- Upload de vídeo que recusa antes de gastar verba: a ingestão sonda duração, dimensões, fps e
  codec com ffprobe e rejeita HEVC/H.265, AV1 e VP9 — e qualquer coisa acima de 60 fps — com o
  motivo e o próximo passo ("reexporte em MP4 H.264 + AAC"); áudio fora do AAC vira aviso. Antes,
  quem descobria era a Meta, na publicação, depois de a verba subir.
- `/criativos` toca o vídeo no próprio card (player nativo, controles e link assinado do arquivo
  original devolvido pela API) e a miniatura sai de um frame do arquivo — com queda para o primeiro
  frame quando o segundo pedido passa do fim do vídeo.
- Ingestão sem carregar o arquivo inteiro na memória: upload direto e importação do Drive escrevem
  em arquivo temporário (`IncomingFile.path`), o hash é em streaming (`sha256File`), o envio ao
  storage é multipart (`Storage.putFile`) e o upload retomável à Meta lê o vídeo por faixa
  (`Storage.getRange` + `uploadVideoFromSource`). Um vídeo de 500 MB sobe como uma imagem de 2 MB.
- Limites de tamanho em dois pontos: a API interrompe o upload acima de `MAX_UPLOAD_BYTES`
  (`MEDIA_SPECS.video.maxSizeBytes`) enquanto o corpo chega, e o worker corta o download do Drive
  no mesmo teto, sem esperar o arquivo terminar.

### Corrigido

- `/criativos`: os motivos da validação de mídia apareciam em branco nos cards — o tipo da web
  esperava `{message, fix}` e a API devolve frases prontas. Agora o card e o resultado do upload
  mostram os erros e também os avisos, que não apareciam em lugar nenhum.
- `@adpub/media`: miniatura de vídeo cai no primeiro frame quando o segundo pedido passa do fim do
  arquivo, em vez de virar "sem thumbnail".
- Imagem do MinIO: o Docker Hub aposentou `minio/minio` e `minio/mc` (`pull access denied`), então o
  compose local, o de produção, o `backup.sh` e os workflows passam a puxar do registro oficial no
  Quay — pinados por release (`RELEASE.2025-09-07T16-13-09Z` no servidor,
  `RELEASE.2025-08-13T08-35-41Z` no `mc`). Sem isso, o próximo `docker compose pull` no host falha.
  O host de produção segue com a imagem antiga até o próximo deploy.
- `apps/mcp`: o cliente da API montava o caminho sem o prefixo `/api/v1`, então toda ferramenta
  respondia 404 contra a API de verdade (o teste de integração usa um duplo e não pegava isso).
  Agora o caminho sai sob `/api/v1` e há teste do contrato em `apps/mcp/test/api.test.ts`.

### Adicionado (MCP: connector do ChatGPT)

- `apps/mcp`: servidor MCP remoto em `https://APP_DOMAIN/mcp` com authorization server próprio —
  metadados RFC 9728/8414, registro dinâmico (RFC 7591), PKCE S256 obrigatório, refresh rotativo com
  detecção de replay e revogação (RFC 7009). Quem age é o usuário que consentiu: cada chamada de
  ferramenta assina a sessão dele, então a API aplica os papéis e a auditoria registra a pessoa, não
  um serviço.
- 13 ferramentas (9 de leitura + 4 de publicação) que falam só com a API existente — nenhuma rota
  nova. `publicar_lote` exige `confirm_count` e as ferramentas de escrita ficam indisponíveis sem o
  escopo de publicação.
- Migration `0012`: `oauth_clients`, `oauth_authorization_codes` e `oauth_tokens` (tokens opacos,
  guardados como SHA-256; acesso de 1 h, refresh de 30 dias).
- Serviço `mcp` no `docker-compose.prod.yml`, rotas no snippet do Caddy e tela de consentimento com
  aviso de gasto; a volta pós-login (`?next=`) passa pelo novo `safeNextPath` em `@adpub/auth`, que
  só aceita caminho interno (o login não vira redirecionamento aberto).
- `docs/mcp.md` (conectar no ChatGPT, ferramentas, decisões de autorização, configuração, local,
  produção e limites) e teste de integração do fluxo completo em
  `apps/mcp/test/oauth-flow.test.ts` (banco descartável + duplo da API).

### Adicionado (deploy de produção)

- `infra/docker-compose.prod.yml` (host compartilhado: web, api, worker,
  Postgres, Redis e MinIO **sem** proxy próprio — o Caddy do stack `mcrm` já é
  dono das portas 80/443 e recebe as rotas por `infra/Caddyfile.snippet`),
  `infra/.env.prod.example`, `infra/backup.sh` e o runbook `docs/deploy.md`. As
  migrações rodam antes de api/worker subirem, o bucket do MinIO é criado uma
  vez (`minio-init`) e nenhuma porta é publicada: `web`/`minio` entram na rede
  `mcrm_internal` com nome fixo de contêiner (`adpub-web`, `adpub-minio`) e a UI
  abre a miniatura por link assinado via `S3_DOMAIN`. Cada serviço tem teto de
  memória e de log (`json-file` 3 × 10 MB) para não atrapalhar os vizinhos.
- Imagens de produção em `apps/{api,worker,web}/Dockerfile` + `.dockerignore`:
  `pnpm deploy` leva o workspace já resolvido (api/worker) e o web usa o
  `output: 'standalone'` do Next; ffmpeg/ffprobe entram nas imagens que
  validam mídia.
- Workflow `Deploy`: publica as três imagens no GHCR (tag = sha) e aplica no
  host por SSH — `login` no GHCR (secret `GHCR_PAT`), `pull`, `migrate`, `up -d`
  — com rollback por sha, falha cedo se a rede do proxy não existir e
  `DEPLOY_PATH` padrão em `/opt/adpub`.
- `infra/deploy-host.sh`: deploy sem GitHub Actions — sincroniza o código para
  `/opt/adpub/app`, constrói as três imagens no host (tag = sha curto), roda
  `migrate` e aplica `up -d --wait`. É o caminho enquanto o repositório não tem
  remote; o workflow `Deploy` assume depois, pelo GHCR.
- `docs/credenciais-externas.md`: passo a passo de cada credencial que falta no
  `.env.prod` de produção (Google OAuth com o redirect exato, app Meta e token do
  System User, chave Anthropic, bot do Telegram), onde cada valor entra, como
  aplicar no host e o checklist de aceite.
- Teste local do stack de produção documentado em `docs/deploy.md` §9.

### Alterado (alertas e telemetria)

- Alertas operacionais saem do Slack e passam a ir por Telegram: `TELEGRAM_BOT_TOKEN`
  + `TELEGRAM_CHAT_ID` (os dois juntos ou nenhum — o schema de env recusa o par
  incompleto). O envio é uma chamada à Bot API e a falha de rede nunca derruba o
  job: o alerta continua no log estruturado.
- Sentry removido: a telemetria fica só com o exportador OpenTelemetry de
  rastros. `sentryDsn`, `environment` e `tracesSampleRate` saem de
  `TelemetryOptions`; `errors` e `captureError` saem do contrato `Telemetry`.
  A falha de job continua visível na linha `job falhou` do worker.

### Corrigido

- `.env.example` (e o exemplo de produção) não definem mais
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` e `OTEL_EXPORTER_OTLP_ENDPOINT`
  vazios: são opcionais válidos só quando ausentes, e o valor vazio derrubava o
  boot da API e do worker.

### Adicionado (SPEC-009 — alertas e operação)

- `alert_events` com dedup por regra+entidade+janela (retry nunca realerta)
  + rotas ack/resolve; regra de fadiga versionada e informativa; sync
  atrasado vigiado. Migração `0011`.
- Flags `FEATURE_AI_ANALYSIS/FEATURE_REPORTS/FEATURE_INSIGHTS` (503 com
  motivo; publish intacto; nav esconde).
- `GET /ops/metrics` (filas, custo IA, falha terminal vs 2%, itens);
  `docs/restore.md` + ondas 009 no piloto.

### Adicionado (SPEC-008 — aprendizados e testes)

- `learnings`: hipótese → observação consistente → teste controlado só por
  registro; briefing determinístico por template; rascunho vinculado ao
  publicador (PAUSED normal); ativação/resultado manuais, negativo permanece.
  Rotas + bloco em `/inteligencia`. Migração `0010`.

### Adicionado (SPEC-007 — inteligência e relatórios)

- Relatório imutável com cópia dos valores usados (reproduzível após
  revisão de conversões); validador bloqueia número inventado, ref
  inexistente, causa sem mídia e viés não declarado (422).
- Rotas gerar/ver/feedback/export(html,csv); `POST .../test-drafts` cria
  lote draft com briefing e vínculo, zero Meta. Tabelas
  `analysis_reports`, `report_feedbacks`, `batches.source_report_id`.
  Migração `0009`. Página `/inteligencia` + jornada e2e.

### Adicionado (SPEC-006 — análise multimodal)

- Pacote `@adpub/creative-intel`: amostragem ffmpeg (grade abertura-densa,
  tetos), adaptador de transcrição (`unavailable` visível, sem provedor
  aprovado), análise visual via Anthropic com tool use forçado, JSON
  validado, custo/latência e cache por conteúdo.
- Invoker com `images[]` (compatível); `AiClient.contentBackend()`.
- `content_analyses` versionada (correção = nova revisão, original
  preservado). Rotas `POST/GET/PATCH`, botão Analisar em `/criativos`.
  Migração `0008`.

### Adicionado (SPEC-005 — motor de métricas e dashboard)

- Pacote `@adpub/analytics`: fórmulas §5 (`metric_version v1`), soma de
  numeradores, denominador zero = indisponível com motivo, alcance não soma,
  coorte compatível ou limitação, veredicto só com política versionada.
- `GET /performance` (conta, período, fonte, nível) com totais, ranking,
  coorte, veredicto, fontes/snapshots e definições. Moeda nas observações
  (contexto/API) + `metric_policy` no cliente. Migração `0007`.
- Página `/performance` + jornada e2e.

### Adicionado (SPEC-004 — sync Meta Insights)

- Cliente Insights no `meta-client`: `getInsights` paginado (parcial nunca
  vira concluído), job assíncrono (`start/get/fetch`), campo inválido vira
  erro permanente com diagnóstico.
- `insight_snapshots` + `account_sync_state` + `snapshot_id` nas observações;
  upsert canônico por célula+fonte, histórico no snapshot. Migração `0006`.
- Fila `adpub.insights-sync` separada do publish; `POST /insights/sync-jobs`
  (backfill 90d em 3 janelas), `GET` estado e `GET /observations`.
  Janela móvel por atribuição; auth segue `needs_attention` sem loop.

### Adicionado (SPEC-003 — importação de relatórios)

- Pacote `@adpub/reports`: CSV próprio (separador farejado, decimal BR,
  utf-8→latin1) + XLSX (`xlsx`, só leitura), dicionário PT/EN versionado,
  regras duras (total excluído, vazio é ausente, consolidado é `period`,
  ID inexato sem vínculo).
- Importação em 3 passos: `POST /report-imports` (prévia), `PATCH .../mapping`
  (ajuste), `POST .../commit` (idempotente; re-upload = 409). Tabelas
  `report_imports`, `report_rows`, `metric_observations`. Migração `0005`.
- Página `/relatorios` + jornada e2e.

### Adicionado (SPEC-002 — biblioteca e linhagem)

- `creative_variants`: composição imutável (mídias ordenadas, copy, destino)
  com fingerprint por cliente, derivada no validate; nome nunca é identidade.
- `ad_creative_bindings`: vínculo observado com janela e precision
  (`confirmed|manual|ambiguous_intraday|media_missing`); publish abre
  `confirmed`, poller marca ambíguo em troca fora do app sem dividir métrica.
- Rotas `GET /variants` e `POST /ad-accounts/:id/bindings` (manual
  auditado); seção de variantes em `/criativos`. Migração `0004`.

### Adicionado (SPEC-001 — conexões e diagnóstico)

- Gate de autorização no worker: publish recusa conexão não-ativa antes de
  qualquer create (`AccountAuthError` → `failed`, sem gastar tentativas);
  `getMe` remoto só se última verificação > 15 min.
- Sync pula conexão sem autorização sem girar em loop; retoma sozinho no
  próximo ciclo após reconectar.
- Rotação de token: `POST /connections/:id/rotate` (testa antes de salvar) +
  botão **Trocar token** em `/contas`, auditado (`connection.rotate`).
- Diagnóstico por conta no `/health`: tier configurado vs observado, última
  verificação, erro, escopos — sem chamar a Meta.
- `docs/capability-matrix.md` testada: `validada` exige evidência; SDK-only
  segue `não-validada`. Causas e ações em `docs/conexoes-operacao.md`.

### Adicionado (SPEC-000 — preservação da publicação)

- Estado `needs_reconciliation`: timeout ou resposta perdida após possível create
  para o item em vez de retry cego; operador adota os IDs (`POST
  /batches/:id/items/:itemId/resolve` com `decision: adopt`) ou descarta com
  motivo (`discard`), tudo auditado (`item.resolve`). Migração `0002`.
- Aprovação vinculada à revisão: `validateBatch` congela `approval_fingerprint`
  (sha256 do conteúdo publicável) no lote; `publishBatch` recusa com 422 se
  qualquer edição aconteceu após validar. Migração `0003`.
- Tempos de estágio no item (`validated_at`, `queued_at`,
  `processing_started_at`, `published_at`) para separar esforço humano, fila e
  Meta (FR-000-06).
- Testes de caracterização: corpos de create sempre `PAUSED` e criativo sem
  campo de status; contrato de publish rejeita `ACTIVE`; transições de
  reconciliação; fingerprint; fase nova no `smoke:integration`.

## [0.1.0] — 2026-09-08

Primeira versão do AdPub: publicação em lote de anúncios da Meta a partir de um briefing, com
validação antes de publicar, fila resiliente e auditoria. Tudo nasce `PAUSED` — ativar continua
sendo decisão humana no Ads Manager.

### Adicionado

#### Conectar a Business Manager e sincronizar ativos (US1)

- Cadastro de conexão com a BM por token de System User, com teste imediato da credencial e o token
  guardado cifrado (AES-256-GCM, chave mestra fora do banco).
- Sincronização de contas de anúncio, páginas, contas do Instagram, pixels, campanhas e conjuntos
  ativos — sob demanda pela tela `/contas` e automaticamente a cada 6 horas.
- Padrões por conta (página, Instagram, pixel e teto diário de anúncios) e por cliente (perfil de
  voz, template de nomenclatura, UTM padrão, domínios de destino, modo de política): o gestor nunca
  digita ID da Meta.
- Token inválido ou expirado marca a conexão como "Requer atenção", pausa as filas de todas as
  contas dela e dispara alerta — sem nunca expor o token.

#### Importar e validar criativos (US2)

- Importação de pastas do Google Drive (em segundo plano) e upload direto de arquivos na biblioteca
  do cliente.
- Validação automática de tipo, dimensões, proporção (1:1, 4:5, 9:16, 16:9, 1.91:1), duração e
  tamanho, com motivo legível e sugestão de correção quando o arquivo é rejeitado.
- Deduplicação por SHA-256: o mesmo arquivo nunca vira dois criativos, e miniaturas são geradas para
  imagem e vídeo.
- Reaproveitamento do `image_hash`/`video_id` já enviado para cada conta: o mesmo criativo não sobe
  duas vezes para a Meta.

#### Montar o lote a partir de briefing com IA (US3)

- Geração do plano do lote (estrutura de campanha e conjunto, mapeamento criativo → conjunto, copies,
  nomes e URLs) a partir de briefing em texto livre, com saída validada por schema.
- Variações de copy no perfil de voz do cliente, respeitando os limites recomendados da Meta
  (texto principal 125, título 40, descrição 30 caracteres) e os termos proibidos.
- Campos que a IA não conseguiu inferir viram "Pendente" e bloqueiam a publicação — nada de URL
  inventada.
- Grade editável: editar copy, CTA, link, nome ou trocar o criativo da linha marca o campo como
  editado.
- Construtor manual (criativos × copies) que produz exatamente o mesmo plano, sem IA.
- Cada geração fica registrada com modelo, versão do prompt, tokens, custo estimado e latência, e é
  reaproveitada por cache quando a mesma entrada se repete.

#### Validar antes de publicar (US4)

- Validação item a item: campos obrigatórios, criativo aceito, compatibilidade de página e
  Instagram, URL e domínio permitidos.
- Nome fora do template do cliente vira sugestão de nome correto; UTM padrão faltando é preenchido
  automaticamente e marcado como automático.
- Pré-checagem de política da copy (promessa de resultado, atributo pessoal, antes/depois, excesso
  de maiúsculas) classificada como erro — que bloqueia — ou aviso — que deixa seguir, conforme a
  política do cliente.

#### Publicar em fila com acompanhamento (US5)

- Publicação por fila, um job por item, percorrendo upload de mídia → campanha → conjunto → criativo
  → anúncio, com o ID de cada etapa persistido antes de avançar.
- Campanha, conjunto e anúncio criados **sempre** `PAUSED`, e apenas com objetivos `OUTCOME_*`.
- Confirmação obrigatória com a contagem exata de itens e respeito ao teto diário de anúncios da
  conta.
- Reprocessamento idempotente: reexecutar um item retoma da etapa que falhou e nunca cria objeto
  duplicado; campanha e conjunto "novos" citados por vários itens são criados uma única vez.
- Uma execução por item, garantida por lease em `ad_drafts` (`lease_owner`/`lease_until`): duas
  entregas simultâneas do mesmo job — o BullMQ reentrega job que considera travado, e worker
  reiniciado deixa o anterior terminando — leriam `meta_ids` vazio ao mesmo tempo e criariam dois
  anúncios na Meta, com um ficando órfão. A perdedora é recusada e reagendada **sem consumir
  tentativa** (`moveToDelayed`): contenção não é falha do item, e quando o dono morre sem liberar a
  espera é a expiração do lease — maior que todas as tentativas somadas, então gastar tentativa
  mataria em `failed` um item que só precisava esperar. O dono é por execução, não por worker: com
  `publishConcurrency > 1` dois jobs do mesmo processo dividiriam o lease.
- Erros transientes fazem retry com backoff exponencial; erros permanentes param no item, com
  mensagem traduzida para português e a resposta original disponível em "detalhes"; o resto do lote
  continua.
- Rate limit lido dos headers da Meta a cada chamada: a concorrência da conta cai e a fila é pausada
  pelo tempo que a Meta informa.
- Upload de vídeo retomável em pedaços, com espera do processamento na Meta sem travar a fila.
- Acompanhamento em tempo real do lote na tela, e link direto para cada objeto no Ads Manager.
- Poller de revisão a cada 10 minutos nos anúncios dos últimos 7 dias, trazendo o status efetivo e o
  motivo de reprovação.
- Alertas operacionais (Slack opcional) para token inválido, conta perto do limite de chamadas e
  lote com mais de 20 % de falhas.

#### Auditoria e permissões (US6)

- Login com Google restrito ao domínio corporativo: o `id_token` é verificado contra o JWKS do
  Google (`aud`, `iss`, `nonce` obrigatório, `email_verified`) e a conta precisa ser de Workspace
  (claim `hd` presente) com e-mail no domínio permitido — e-mail de conta pessoal terminando no
  domínio não abre a porta. Papéis: admin, coordenador, gestor e leitor.
- Escopo por conta: o gestor só enxerga as contas atribuídas a ele e recebe 403 nas demais.
- Trilha de auditoria de toda ação de escrita (criar lote, gerar plano, editar item, validar,
  publicar, reprocessar, duplicar, alterar conexão, alterar padrões da conta, alterar usuário), com
  ator, entidade, antes e depois — e segredos mascarados.
- Tela de auditoria com filtro por entidade, ator e período.
- Registro de toda chamada à Meta com endpoint, versão da API, latência, código de erro e uso de
  rate limit.

#### Duplicar lote para outra conta (US7)

- Duplicação de um lote para outra conta do mesmo cliente: copies e criativos são reaproveitados, a
  página, o Instagram e o nome de cada item são remapeados para os padrões da conta de destino e
  tudo é revalidado. O envio dos criativos para a nova conta acontece na primeira publicação.

#### Painel de saúde da API (US8)

- Tela `/saude` com, por conta: status da conexão, uso de rate limit, pausa em vigor, anúncios
  publicados no dia contra o teto, jobs pendentes, taxa de erro da última hora e latência P95.

#### Plataforma e engenharia

- Monorepo pnpm + Turborepo com as aplicações `web`, `api` e `worker` e os pacotes `config`,
  `shared`, `db`, `crypto`, `auth`, `meta-client`, `ai`, `rules`, `media`, `storage`, `assets` e
  `telemetry`.
- Observabilidade opcional: rastros OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`) e erros no
  Sentry (`SENTRY_DSN`). Sem essas variáveis nenhum SDK é carregado.
- Token nunca sai em texto: `maskText` (em `packages/crypto`, junto de `mask`/`redact`) mascara
  segredo em query string **e** o token da Meta em texto livre — a Graph API ecoa
  `Malformed access token EAA…` dentro da mensagem de erro, fora de qualquer `chave=valor`, e o
  redator por chave não alcança isso. `redact` aplica em toda string, então log, auditoria e
  `meta_api_calls` nascem limpos.
- API e worker usam o mesmo `redactingLogger`, que mascara a linha já serializada
  (`hooks.streamWrite`; o padrão nunca consome a barra de um `\"`, então a linha continua sendo
  JSON válido) — `formatters.log` e `hooks.logMethod` rodam antes dos serializers, então
  `req.url` do Fastify escapava por ali. Como nada mais reescreve o objeto de log, `req`, `res` e
  `err` chegam íntegros ao serializer.
- O mesmo mascaramento cobre o evento do Sentry, os breadcrumbs do integration HTTP e os atributos
  de URL dos spans do OpenTelemetry.
- API Fastify com contrato OpenAPI publicado em `/docs` e erros em `application/problem+json`.
- Regra de lint que impede qualquer código fora do worker de importar as escritas da Graph API.
- Versão da Graph API fixada por configuração (`META_API_VERSION`) e validada no boot e no cliente.
- Testes de unidade e de contrato com respostas gravadas da Graph API, testes de ponta a ponta com a
  Meta mockada, smoke de integração com Graph API falsa e smoke em conta de teste que cria e arquiva
  anúncios reais.
- CI com scan de segredos, build, lint, typecheck, testes, scan de token em log, smoke de integração
  e e2e Playwright; a fumaça em conta real fica num workflow separado, manual ou por release.
- `truncateAllTables` (usado só por fumaça e e2e) exige `ADPUB_ALLOW_TRUNCATE=1` **e** banco em
  loopback ou com sufixo `_test`/`_e2e`; a fumaça em sandbox mascara token e app secret em console,
  log estruturado e erro fatal.
- Recriar o plano de um lote (IA ou construtor manual) roda numa transação só - checagem, delete dos
  itens antigos, inserção dos novos e gravação do plano: falha no meio faz rollback (o lote nunca
  fica sem itens) e o lock do lote serializa duas recriações simultâneas. Se algum item estiver em
  publicação ou publicado, a troca é recusada com 422.
- Infra local por Docker Compose (Postgres, Redis e MinIO), com portas configuráveis para conviver
  com serviços já instalados na máquina.
- Documentação técnica: `README.md`, `docs/spike-meta.md`, `docs/erros-meta.md`,
  `docs/meta-app-review.md`, `docs/migracao-v26.md` e `docs/piloto-e-rollout.md`.
