# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue
[Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

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
- API e worker usam o mesmo `redactingLogger`; o mascaramento preserva `Error` (mensagem e stack) e
  as instâncias que o Fastify serializa (`req`/`res`), copiando só objeto literal e array.
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
