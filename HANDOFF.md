# HANDOFF — AdPub

Data: 2026-09-11. Branch `main` limpa até `cfcf074`. Produção **no ar** em
`https://adpub.179-198-104-210.sslip.io` (host compartilhado, atrás do Caddy do `mcrm`); falta só
preencher as chaves externas do `.env.prod` (§3, item 1).

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
- Sem login: entra direto como admin dev.
- Se o Mac dormiu, o colima morre — rode `dev-up.sh` de novo.
- Banco local tem **seed demo** (BM Demo, Demo Store, act_demo, 5 lotes). Apagar antes de teste
  sério: `DELETE FROM batches; DELETE FROM ad_accounts; DELETE FROM clients; DELETE FROM meta_connections;`
- Stack de produção na máquina de dev: `docs/deploy.md` §9.

## 3. O que falta (infra/humano)

1. **Fechar a configuração de produção (só chaves externas)** — passo a passo em
   `docs/credenciais-externas.md`: no `/opt/adpub/.env.prod` há 6 `TROCAR` —
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (OAuth com redirect
   `https://adpub.179-198-104-210.sslip.io/api/auth/callback`), `META_APP_ID`/`META_APP_SECRET`,
   `ANTHROPIC_API_KEY` e `AUTH_ALLOWED_DOMAIN` (hoje `w3bsite.com.br` — **conferir**: é o domínio
   Google dos usuários). Depois: `docker compose -f docker-compose.prod.yml --env-file .env.prod up
   -d web api worker`. O primeiro login Google do domínio nasce admin.
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
- **Warning Astryx "theme build"**: tema usa runtime injection; pré-compilar quando performance importar.
- **Mapa PT em `ui.tsx`** (`STATUS_PT/CTA_PT/FORMAT_PT/GOAL_PT`): slug novo na API precisa de rótulo aqui.
- **`tmp/` é ignorado pelo git**: `dev-up.sh` e `dev-logs/dev.env` vivem só nesta máquina.
- **Deploy**: o Caddy é do stack `mcrm` (anexar o snippet **uma vez** ao `/opt/mcrm/Caddyfile` e
  recarregar; repetir duplica os blocos e o Caddy recusa a config); `web`/`minio` precisam da rede
  externa `mcrm_internal` — sem ela o compose falha; `S3_ENDPOINT` precisa ser o domínio público
  (`S3_DOMAIN`) porque o browser abre o link assinado; o bucket nasce no `minio-init` (o app não
  cria bucket); variável opcional de URL **vazia** derruba o boot — deixe comentada no `.env.prod`;
  `backup.sh` entra na rede pelo nome fixo `adpub_internal` (não troque o `name:` dela à toa).
- **Host compartilhado**: cada serviço tem teto de memória (soma ~4,8 GB) e log `json-file` de
  3 × 10 MB — subir algo sem limite atrapalha `mcrm`/`creativeos`, que dividem a máquina.
- **Rollback**: a imagem volta por sha (`IMAGE_TAG`), o schema não; migração destrutiva exige restore
  do dump (`docs/restore.md`).
- **`pnpm --filter … deploy` local poda devDeps do repositório** — esse comando só dentro do
  Dockerfile. Se um build do web falhar com módulo não encontrado: `rm -rf apps/web/.next` e
  `pnpm install`.
- **Next standalone** (`output: 'standalone'` em `apps/web/next.config.ts`): o servidor de produção
  é `node apps/web/server.js`; `next start` continua valendo para o dev.

## 5. Próximos passos sugeridos

1. Provisionar o VPS e rodar o primeiro deploy (caminho crítico de piloto e App Review).
2. Piloto T098 com 2 gestores.
3. Revisar `docs/erros-meta.md` e `docs/spike-meta.md` antes do App Review.
4. Se criar slug/status novo: atualizar mapa PT + spec e2e correspondente.
