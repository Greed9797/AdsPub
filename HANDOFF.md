# HANDOFF — AdPub

Data: 2026-09-11. Branch `main` limpa.

## 1. Estado atual

- UI migrada para Astryx (fases 1–3) + vocabulário PT para leigos (fases A–C); slugs de API intactos.
- Gates verdes: typecheck, eslint, build, testes, **e2e** e screenshot real conferido.
- CI de verificação: `.github/workflows/ci.yml` (gitleaks, build, lint, typecheck, testes, scan de
  token nos logs, `smoke:integration` e e2e) + `.github/workflows/smoke.yml` (conta de teste real,
  manual ou por release).
- **Deploy de produção existe**: `apps/{api,worker,web}/Dockerfile` + `.dockerignore`, stack do VPS
  em `infra/docker-compose.prod.yml` (web, api, worker, Postgres, Redis, MinIO, Caddy com TLS),
  `infra/.env.prod.example`, `infra/backup.sh`, workflow `Deploy` (GHCR + SSH) e o runbook
  `docs/deploy.md`. Verificado localmente ponta a ponta: migrações do zero (12/12) e idempotentes,
  upload → validação (`sharp`) → MinIO → miniatura por link assinado, UI servida pelo container,
  backup (pg_dump + espelho do MinIO) e restore em banco limpo.

## 2. Como rodar local

```bash
bash tmp/dev-up.sh   # recria colima se morto, sobe compose, migra, liga api/worker/web
open http://localhost:3000/
```

- Web `:3000`, API `:4000` (`/health`). Sem login: entra direto como admin dev.
- Se o Mac dormiu, o colima morre — rode `dev-up.sh` de novo.
- Banco local tem **seed demo** (BM Demo, Demo Store, act_demo, 5 lotes). Apagar antes de teste
  sério: `DELETE FROM batches; DELETE FROM ad_accounts; DELETE FROM clients; DELETE FROM meta_connections;`
- Stack de produção na máquina de dev: `docs/deploy.md` §9.

## 3. O que falta (infra/humano)

1. **Provisionar o VPS** — DNS (`APP_DOMAIN`, `S3_DOMAIN`), usuário `deploy`, Docker, `docker login
   ghcr.io`, `.env.prod` e os secrets/vars do GitHub (`DEPLOY_SSH_KEY`/`DEPLOY_HOST`/`DEPLOY_USER`;
   opcionais `DEPLOY_PORT`/`DEPLOY_PATH`). Passo a passo: `docs/deploy.md` §3–5. Depois: Google
   OAuth (redirect `https://APP_DOMAIN/api/auth/callback`) e Meta app apontando para essa URL.
2. **Piloto T098/T100** — plano humano em `docs/piloto-e-rollout.md`, checkboxes zerados: escolher 3
   contas, cadastrar clientes, criar 2 gestores `manager`, rodar 2 semanas.
3. **Meta App Review** — `docs/meta-app-review.md`; sem aprovação, token real só opera em Limited.
   O ambiente de teste do revisor passa a ser `https://APP_DOMAIN`.
4. **Primeiro deploy contra o banco real** — as migrações foram conferidas do zero (12/12) e são
   idempotentes; falta rodar o checklist do `docs/deploy.md` §5 no servidor (banco novo, `meta_tier`
   conferido, BM conectada, um criativo de teste).
5. **Segredos de produção** — gerar `MASTER_KEY`/`AUTH_SECRET`/senhas como em `docs/deploy.md` §2 e
   guardar só no servidor; trocar `MASTER_KEY` depois invalida os tokens cifrados.

## 4. Débitos técnicos assumidos (não mexer sem motivo)

- **Inputs nativos mantidos**: Astryx `TextInput` é controlled sem `name` — quebraria os FormData.
- **`ButtonLink`** (`components/button-link.tsx`): `as={Link}` não cruza server→client.
- **Botão primário com texto ink** (não branco): decisão AA 5.91:1 sobre o laranja.
- **`next lint` quebrado**: lint válido é `pnpm run lint` (raiz).
- **Playwright browsers**: `pnpm exec playwright install chromium --only-shell` se o cache sumir.
- **Warning Astryx "theme build"**: tema usa runtime injection; pré-compilar quando performance importar.
- **Mapa PT em `ui.tsx`** (`STATUS_PT/CTA_PT/FORMAT_PT/GOAL_PT`): slug novo na API precisa de rótulo aqui.
- **`tmp/` é ignorado pelo git**: `dev-up.sh` e `dev-logs/dev.env` vivem só nesta máquina.
- **Deploy**: só o Caddy publica portas; `S3_ENDPOINT` precisa ser o domínio público (`S3_DOMAIN`)
  porque o browser abre o link assinado; o bucket nasce no `minio-init` (o app não cria bucket);
  variável opcional de URL **vazia** derruba o boot — deixe comentada no `.env.prod`.
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
