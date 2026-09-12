# HANDOFF — AdPub

Data: 2026-09-12. Branch `main` limpa até `20b46bb` (correções do diagnóstico de IA incluídas, além
do vídeo). Produção
**no ar** em `https://adpub.179-198-104-210.sslip.io` (host compartilhado, atrás do Caddy do `mcrm`);
falta só preencher as chaves externas do `.env.prod` (§3, item 1) — o host ainda roda a imagem
anterior, sem o MCP e sem o vídeo.

## 1. Estado atual

- UI migrada para Astryx (fases 1–3) + vocabulário PT para leigos (fases A–C); slugs de API intactos.
- Gates verdes: typecheck, eslint, build, testes, **e2e** e screenshot real conferido.
- CI de verificação: `.github/workflows/ci.yml` (gitleaks, build, lint, typecheck, testes, scan de
  token nos logs, `smoke:integration` e e2e) + `.github/workflows/smoke.yml` (conta de teste real,
  manual ou por release).
- **Deploy de produção está NO AR** em host compartilhado (o Caddy do stack `mcrm` é dono das
  80/443; o AdPub não sobe proxy nem publica porta): `https://adpub.179-198-104-210.sslip.io/login`
  responde 200 com certificado Let's Encrypt emitido, `https://adpub-s3.179-198-104-210.sslip.io`
  serve o MinIO, 12 migrações aplicadas num banco novo (`clients` = 0, sem seed demo),
  `GET /api/v1/health` → `{"status":"ok","meta_tier":"limited"}` e o backup rodou de verdade
  (`/var/backups/adpub/`) com cron diário instalado. Tudo sob `/opt/adpub` (`.env.prod` 600, segredos
  gerados no próprio host) e imagens `adpub/adpub-{api,worker,web}:<sha>` construídas no host por
  `infra/deploy-host.sh` — o repositório ainda não tem remote no GitHub, então o workflow `Deploy`
  (GHCR) fica pronto para quando tiver.
- **Vídeo de ponta a ponta** (entra no próximo deploy, junto com o MCP): a ingestão nunca carrega o
  arquivo inteiro — upload da API e importação do Drive passam por temporário, hash e storage em
  streaming, e o upload retomável à Meta lê o vídeo por faixa. A validação sonda duração, dimensões,
  fps e codec com ffprobe e recusa HEVC/H.265, AV1, VP9 e acima de 60 fps **antes** de a verba
  subir, com o motivo e o próximo passo ("reexporte em MP4 H.264 + AAC"); áudio fora do AAC vira
  aviso. O card de `/criativos` toca o vídeo pelo link assinado e mostra erros e avisos (antes
  apareciam em branco). Conferido no stack local: H.264 1080×1920 passa e toca, HEVC, 0,4 s e
  áudio MP3 se comportam como acima, e a faixa (`Range: bytes=0-1023`) do MinIO devolve 206.
- **Correções do diagnóstico de IA** (`docs/analise-arquitetura-ia.md`, frentes 1–6): contexto de marca
  e claims que chegavam quebrados ao prompt, evidência obrigatória validada contra a grade de
  amostragem, snapshot de relatório que **declara** o que ficou fora em vez de cortar JSON no meio,
  identidade de cache com modelo/escopo/revisão e regeneração explícita com dedupe, contabilidade de
  IA por tentativa em todas as finalidades (inclusive falhas de validação), cache de prefixo do
  provedor precificado como categoria própria, ciclo de feedback do plano alimentando as próximas
  gerações, análise de mídia movida para job no worker com fila própria e tela de acompanhamento,
  cache conferido antes de baixar/decodificar, política com concorrência limitada e teto de saída
  por finalidade com truncamento explícito. Gate por gate em `docs/analise-arquitetura-ia.md` §10.
- **Rede/rotas**: `adpub-web` e `adpub-minio` entram em `mcrm_internal`; o bloco de rotas está
  anexado ao `/opt/mcrm/Caddyfile` (backup em `Caddyfile.bak.adpub.*`) e foi validado + recarregado.
- **Alertas no Telegram** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, os dois juntos ou nenhum) e
  telemetria só de rastros OpenTelemetry — o Sentry saiu do código, das deps e do schema de env.
- **MCP (connector do ChatGPT) pronto no código, ainda não no host**: `apps/mcp` publica
  `https://APP_DOMAIN/mcp` com authorization server próprio (PKCE S256, refresh rotativo com
  detecção de replay, revogação), 13 ferramentas que falam só com a API existente e consentimento
  com o escopo do usuário logado — quem age é a pessoa, não um serviço. Migration `0012`
  (`oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`) entra no próximo deploy; o host
  ainda roda a imagem anterior. Passo a passo, decisões e verificação em `docs/mcp.md`.

## 2. Como rodar local

```bash
bash tmp/dev-up.sh   # recria colima se morto, sobe compose, migra, liga api/worker/web/mcp
open http://localhost:3000/
```

- Web `:3000`, API `:4000` (`/health`), MCP `:4410/mcp` — a 4100 já é do stack `openbotw3` nesta
  máquina, então `MCP_PORT` e `MCP_PUBLIC_URL` andam juntos (issuer sai da URL pública).
- `dev-up.sh` checa a **porta** de cada serviço (não só o processo): se um ficou travado com o filho
  morto, ele reinicia sozinho. E `node tmp/mcp-real-journey.mjs` (com o stack no ar) roda a jornada
  do MCP contra a **API real** — consentimento, escopos, ferramentas e um `criar_lote` de smoke
  (cria um lote "Smoke MCP (pode apagar)" no seed demo; não há rota de DELETE para ele).
- Sem login: entra direto como admin dev.
- Se o Mac dormiu, o colima morre — rode `dev-up.sh` de novo.
- Banco local tem **seed demo** (BM Demo, Demo Store, act_demo, 5 lotes). Apagar antes de teste
  sério: `DELETE FROM batches; DELETE FROM ad_accounts; DELETE FROM clients; DELETE FROM meta_connections;`
- Stack de produção na máquina de dev: `docs/deploy.md` §9.
- Fumaça de integração (Graph API falsa, sem tocar a Meta). O script **apaga** o banco apontado por
  `DATABASE_URL` (o opt-in `ADPUB_ALLOW_TRUNCATE=1` já vem no npm script; a trava também exige
  loopback ou sufixo `_test`/`_e2e`). Receita verificada em 2026-09-12, commit `4d7c6fb`, sha do
  script `4edbbc63…`:

  ```bash
  docker exec adpub-postgres-1 psql -U adpub -d postgres -c "create database adpub_smoke"  # uma vez
  set -a; . tmp/dev-logs/dev.env; set +a
  export DATABASE_URL="postgres://adpub:adpub@localhost:55432/adpub_smoke" REDIS_URL="redis://localhost:56379/4"
  pnpm db:migrate && pnpm smoke:integration   # 139 checagens ok, SMOKE OK
  ```

  Foi assim que a quebra de contrato da análise em job apareceu.
- Provas do diagnóstico de IA, contra o banco local (invoker falso, nenhuma chamada paga, nunca em
  produção): `DATABASE_URL=postgres://adpub:adpub@localhost:55432/adpub pnpm prova:a1` (contexto
  visual no plano), `pnpm prova:a5` (cache sem download) e `pnpm prova:a10` (indisponibilidade não
  vira aprovação).

## 3. O que falta (infra/humano)

1. **Fechar a configuração de produção (só chaves externas)** — passo a passo em
   `docs/credenciais-externas.md`: no `/opt/adpub/.env.prod` há 6 `TROCAR` —
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (OAuth com redirect
   `https://adpub.179-198-104-210.sslip.io/api/auth/callback`), `META_APP_ID`/`META_APP_SECRET`,
   `ANTHROPIC_API_KEY` e `AUTH_ALLOWED_DOMAIN` (hoje `w3bsite.com.br` — **conferir**: é o domínio
   Google dos usuários). Depois: `docker compose -f docker-compose.prod.yml --env-file .env.prod up
   -d web api worker`. O primeiro login Google do domínio nasce admin.
1b. **Antes do próximo deploy**: três migrações novas no host (`0013` insights, `0014` `ai_usage`,
   `0015` `content_analyses` + `analysis_jobs`) entram no `migrate`. A fumaça de **integração**
   (`pnpm smoke:integration`, Graph API falsa) foi rodada em 2026-09-12 contra banco novo: 139
   checagens ok, 0 falhas — ela pegou a quebra de contrato que a A9 causou e o script foi corrigido
   junto. A fumaça de **sandbox** (`pnpm smoke:sandbox`, conta de teste real) **não** foi rodada:
   exige `SMOKE_META_TOKEN`/`SMOKE_BUSINESS_ID`/`SMOKE_AD_ACCOUNT_ID` do System User, que vivem nos
   secrets do CI e não estão nesta máquina — é o último gate antes de subir release (Constituição V),
   e o caminho de upload de vídeo mudou desde a última fumaça.
2. **Subir o MCP no host** (mesma tacada do item 1, mas o Caddy muda): sincronizar o código
   (`HOST=w3vps ./infra/deploy-host.sh` ou `git pull` em `/opt/adpub/app`), rodar `migrate` (cria as
   tabelas `oauth_*`), `up -d mcp api web worker` e **substituir** o bloco do AdPub no
   `/opt/mcrm/Caddyfile` pelo `infra/Caddyfile.snippet` novo — o `mcp` entrou nas rotas e duplicar o
   bloco faz o Caddy recusar a config. Depois siga a verificação do `docs/mcp.md` §6 e conecte o
   connector em `https://adpub.179-198-104-210.sslip.io/mcp`.
3. **Piloto T098/T100** — plano humano em `docs/piloto-e-rollout.md`, checkboxes zerados: escolher 3
   contas, cadastrar clientes, criar 2 gestores `manager`, rodar 2 semanas (item 1.1 já tem os
   alertas no Telegram prontos para preencher).
4. **Publicar o repositório no GitHub** (ainda não tem remote) para ligar o workflow `Deploy`/GHCR,
   o CI de verificação e os secrets `DEPLOY_SSH_KEY`/`DEPLOY_HOST`/`DEPLOY_USER` (+`GHCR_PAT`, já
   que o host não tem login no GHCR). Até lá o deploy é `HOST=w3vps ./infra/deploy-host.sh`.
5. **Meta App Review** — `docs/meta-app-review.md`; sem aprovação, token real só opera em Limited.
   O ambiente de teste do revisor passa a ser `https://adpub.179-198-104-210.sslip.io`.
6. **Segredos de produção** — já gerados no host (`MASTER_KEY`/`AUTH_SECRET`/senhas, `chmod 600`);
   trocar `MASTER_KEY` depois invalida os tokens cifrados (é preciso reconectar). `AUTH_SECRET`
   trocado revoga as sessões do app e os consentimentos do MCP de uma vez.

## 4. Débitos técnicos assumidos (não mexer sem motivo)

- **Inputs nativos mantidos**: Astryx `TextInput` é controlled sem `name` — quebraria os FormData.
- **`ButtonLink`** (`components/button-link.tsx`): `as={Link}` não cruza server→client.
- **Botão primário com texto ink** (não branco): decisão AA 5.91:1 sobre o laranja.
- **`next lint` quebrado**: lint válido é `pnpm run lint` (raiz).
- **Playwright browsers**: `pnpm exec playwright install chromium --only-shell` se o cache sumir.
- **e2e**: portas padrão 4310 (API) e 3310 (web) — nesta máquina a 4310 é do `agent-cli` do
  `openbot3`, então rode com `E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e`.
- **Warning Astryx "theme build"**: tema usa runtime injection; pré-compilar quando performance importar.
- **Mapa PT em `ui.tsx`** (`STATUS_PT/CTA_PT/FORMAT_PT/GOAL_PT`): slug novo na API precisa de rótulo aqui.
- **`tmp/` é ignorado pelo git**: `dev-up.sh` e `dev-logs/dev.env` vivem só nesta máquina.
- **Deploy**: o Caddy é do stack `mcrm` (anexar o snippet **uma vez** ao `/opt/mcrm/Caddyfile` e
  recarregar; repetir duplica os blocos e o Caddy recusa a config); `web`/`minio` precisam da rede
  externa `mcrm_internal` — sem ela o compose falha; `S3_ENDPOINT` precisa ser o domínio público
  (`S3_DOMAIN`) porque o browser abre o link assinado; o bucket nasce no `minio-init` (o app não
  cria bucket); variável opcional de URL **vazia** derruba o boot — deixe comentada no `.env.prod`;
  `backup.sh` entra na rede pelo nome fixo `adpub_internal` (não troque o `name:` dela à toa).
- **MinIO**: a imagem saiu do Docker Hub para o Quay (`quay.io/minio/...`, pinada por release) — o
  container do host ainda roda a antiga até o próximo `pull`; o `mc` embutido no servidor é o que o
  healthcheck usa (`mc ready local`).
- **MCP**: o cliente fala com a API sob `/api/v1` (o prefixo é montado em `apps/mcp/src/api.ts`, com
  teste) — caminho novo de ferramenta não deve incluir o prefixo; as ferramentas de escrita só
  existem com o escopo `adpub:write` e a checagem vem antes da chamada à API.
- **Vídeo**: o caminho de upload para a Meta mudou para leitura por faixa (e o protocolo ficou
  coberto pelo teste das fronteiras de 4 MB), mas a Constituição V não perdoa: antes do próximo
  deploy, `pnpm smoke:sandbox` de novo na conta de teste. A validação local recusa o que o browser
  toca e a Meta não aceita (HEVC), então "toca aqui" não é sinal de que publica.
- **Host compartilhado**: cada serviço tem teto de memória (soma ~4,8 GB) e log `json-file` de
  3 × 10 MB — subir algo sem limite atrapalha `mcrm`/`creativeos`, que dividem a máquina.
- **Rollback**: a imagem volta por sha (`IMAGE_TAG`), o schema não; migração destrutiva exige restore
  do dump (`docs/restore.md`).
- **Fila de análise**: o worker roda duas filas — publicação e `adpub.analysis` (concorrência 1). Se
  o worker ficar parado, jobs ficam `queued` em `analysis_jobs` e a tela mostra "na fila"; a
  reentrega é idempotente, então subir o worker resolve. Não aumentar a concorrência da publicação
  para acelerar IA (limite é da Meta, e o estado é financeiro).
- **Roteamento de modelo não é automático de propósito**: o diagnóstico condiciona a troca a um
  baseline medido (custo por geração aceita, com qualidade não pior). O caminho está em
  `docs/avaliacao-geracoes.md` (rode o eval com `--model`, compare os dois arquivos) — não ligar
  escalada antes disso.
- **`scripts/prova-*.ts` escrevem no banco de desenvolvimento** (lote, análise e `policy_mode`):
  apontam para o `DATABASE_URL` local por decisão — nunca rode contra produção.
- **`pnpm --filter … deploy` local poda devDeps do repositório** — esse comando só dentro do
  Dockerfile. Se um build do web falhar com módulo não encontrado: `rm -rf apps/web/.next` e
  `pnpm install`.
- **Next standalone** (`output: 'standalone'` em `apps/web/next.config.ts`): o servidor de produção
  é `node apps/web/server.js`; `next start` continua valendo para o dev.

## 5. Próximos passos sugeridos

1. Fechar as chaves externas do `.env.prod` e subir MCP + vídeo no host (§3, itens 1 e 2) — é o
   caminho crítico do piloto e do App Review; o deploy do vídeo exige `pnpm smoke:sandbox` antes.
2. Piloto T098 com 2 gestores.
3. Revisar `docs/erros-meta.md` e `docs/spike-meta.md` antes do App Review.
4. Criativos de vídeo no piloto: mandar 2–3 no formato real do cliente (9:16, H.264) para exercitar
   o limite de 500 MB e a miniatura com arquivo de verdade.
5. Baseline de custo/qualidade antes de mexer em modelo: rodar o eval com o modelo de geração atual e
   com o econômico (`docs/avaliacao-geracoes.md`), com revisor humano às cegas, e só então decidir
   roteamento. A query de custo por geração aceita já está no mesmo documento.
6. Se criar slug/status novo: atualizar mapa PT + spec e2e correspondente.
