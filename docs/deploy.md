# Deploy de produção (VPS único)

Tudo o que a produção precisa está em `infra/`: `docker-compose.prod.yml` (o stack), `Caddyfile`
(TLS automático), `.env.prod.example` (segredos) e `backup.sh`. O deploy é feito pelo workflow
[`Deploy`](../.github/workflows/deploy.yml), que publica as três imagens no GHCR e aplica no
servidor por SSH. O runner do CI é amd64: o VPS precisa ser amd64 (ou trocar `platforms` no
workflow e usar buildx).

## 1. Topologia

| Serviço | O que é | Exposto |
|---|---|---|
| `caddy` | TLS (Let's Encrypt) e proxy reverso | **80/443** |
| `web` | Next.js (BFF; única cara do produto) | só a rede interna |
| `api` | Fastify (contrato OpenAPI, produtor das filas) | só a rede interna |
| `worker` | consumidores BullMQ (único que escreve na Meta) | só a rede interna |
| `migrate` | aplica `@adpub/db` e sai (roda antes de api/worker) | — |
| `postgres` `redis` | banco e filas | só a rede interna |
| `minio` | storage S3 | via `S3_DOMAIN` no Caddy (links assinados do browser) |

Nenhuma porta de app/banco é publicada: para inspecionar a API ou o console do MinIO, use o IP
interno do container (`docker compose exec -T api hostname -i`) por um túnel SSH.

Requisitos: VPS Linux amd64, 2 vCPU / 4 GB para o piloto, Ubuntu 24.04, Docker Engine + plugin
`compose`, e dois registros DNS `A` (`APP_DOMAIN` e `S3_DOMAIN`) apontando para o IP.

## 2. Segredos

| Variável | Como gerar / obter |
|---|---|
| `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` | `openssl rand -hex 24` (hex não quebra URL) |
| `MASTER_KEY` | `openssl rand -base64 32` — 32 bytes em base64, **fora do banco**; trocar depois invalida os tokens cifrados (é preciso reconectar) |
| `AUTH_SECRET` | `openssl rand -hex 32` — assina a sessão e o login interno |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client do Google Cloud com redirect URI `https://APP_DOMAIN/api/auth/callback` |
| `META_APP_ID` / `META_APP_SECRET` | painel do app Meta (mesmo app do App Review) |
| `ANTHROPIC_API_KEY` | console da Anthropic |

O `.env.prod` vive **só no servidor** (`chmod 600`) — nunca no repositório. O CI já roda `gitleaks`.

## 3. Preparar o VPS (uma vez)

```bash
# no servidor, como root:
adduser --disabled-password --gecos '' deploy && usermod -aG docker,sudo deploy
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable

# como deploy:
mkdir -p ~/.ssh && chmod 700 ~/.ssh   # cole a chave pública do CI em authorized_keys
mkdir -p /srv/adpub && cd /srv/adpub
# o CI leva compose/Caddyfile/backup a cada deploy; o .env.prod é seu:
scp infra/.env.prod.example deploy@servidor:/srv/adpub/.env.prod   # e edite
chmod 600 .env.prod

# para puxar imagem privada do GHCR (PAT com read:packages):
echo "$GHCR_PAT" | docker login ghcr.io -u <usuário> --password-stdin
```

Preencha o `.env.prod` antes do primeiro deploy: domínios, senhas, `MASTER_KEY`, `AUTH_SECRET`,
Google, Meta e Anthropic. `IMAGE_TAG` pode ficar em `latest` até o primeiro deploy do CI (o
workflow exporta o sha do commit).

## 4. Primeiro deploy

```bash
# no servidor
cd /srv/adpub
export IMAGE_TAG=<sha-ou-latest>
docker compose -f docker-compose.prod.yml --env-file .env.prod pull api worker web
docker compose -f docker-compose.prod.yml --env-file .env.prod run -T --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait --wait-timeout 180
```

O `up -d --wait` só retorna quando todos os contêineres estão de pé e saudáveis (é o mesmo comando
que o CI usa). Ele sobe Postgres/Redis/MinIO (com volume próprio), cria o bucket (`minio-init`),
aplica as migrações (`migrate`) e só então sobe `api`, `worker`, `web` e `caddy`. O primeiro
certificado sai na primeira requisição HTTPS.

Depois disso, os deploys seguintes são pelo workflow: **Actions → Deploy → Run workflow** (ou
publique uma tag `v*`). Segredos/variáveis do repositório: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
`DEPLOY_USER`; opcionais `DEPLOY_PORT` e `DEPLOY_PATH` (`/srv/adpub` por padrão).

## 5. Verificação pós-deploy

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://APP_DOMAIN/login          # 200
curl -fsS -o /dev/null -w '%{http_code}\n' https://S3_DOMAIN/minio/health/live  # 200

cd /srv/adpub
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
  node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.text()).then(console.log)"
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U adpub -d adpub -c 'select id, created_at from drizzle.__drizzle_migrations order by created_at;'
```

Checklist do primeiro deploy:

- [ ] `https://APP_DOMAIN` abre o login; o **primeiro usuário do domínio nasce admin** e os
      seguintes entram como `manager` (papel ajustado em `/usuarios`).
- [ ] `GET /api/v1/health` mostra `meta_tier` igual ao `META_TIER` do `.env.prod` (ver
      `docs/meta-app-review.md` §1).
- [ ] Banco é novo: `select count(*) from clients;` = 0 — o seed de demonstração (BM Demo/Demo
      Store) só existe no harness de e2e (`scripts/e2e/`), nunca em produção.
- [ ] Conexão da BM criada em `/contas` com o token do System User e **Sincronizar** traz contas,
      páginas, IGs e pixels.
- [ ] Um criativo de teste sobe em `/criativos` (valida `ffprobe`/`sharp` da imagem) e a miniatura
      aparece — é o caminho dos links assinados passando pelo Caddy.
- [ ] `/saude` sem conta em "Requer atenção" e filas vazias (`GET /ops/metrics`).
- [ ] Backup roda: `./backup.sh` e confira os arquivos.

## 6. Migrações e banco

As migrações rodam no serviço `migrate` a cada deploy, antes de `api`/`worker`. O histórico local
foi recriado do zero várias vezes, então a conferência contra um banco limpo faz parte do primeiro
deploy: `drizzle.__drizzle_migrations` precisa listar as migrações na ordem de
`packages/db/migrations/meta/_journal.json` e o `migrate` precisa terminar com exit 0.

Rollback de aplicação (a imagem volta, o schema **não**):

```bash
cd /srv/adpub
IMAGE_TAG=<sha-anterior> docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Se a release tiver migração destrutiva, o rollback é o restore do dump (`docs/restore.md`).

## 7. Backup

`infra/backup.sh` (o CI copia para `/srv/adpub`) faz `pg_dump` + espelho do bucket:

```cron
# /etc/cron.d/adpub-backup
30 3 * * * deploy cd /srv/adpub && ./backup.sh /var/backups/adpub >> /var/log/adpub-backup.log 2>&1
0 4 * * * deploy find /var/backups/adpub -type f -mtime +30 -delete
```

Restore: `docs/restore.md`. Teste o restore pelo menos uma vez antes do piloto.

## 8. Operação

| Situação | Comando (no servidor, em `/srv/adpub`) |
|---|---|
| Ver contêineres | `docker compose -f docker-compose.prod.yml --env-file .env.prod ps` |
| Logs de um serviço | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker` |
| Reiniciar após mudar o `.env.prod` | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d` |
| Desligar uma área nova (rollback de flag) | `FEATURE_X=0` no `.env.prod` + `up -d web` |
| Console do MinIO | túnel SSH para `<ip-do-container>:9001` |

Trocar `META_TIER=limited → full` (depois do App Review) é `.env.prod` + `up -d worker api`.

## 9. Testar o stack de produção localmente

O mesmo compose sobe na máquina de dev — sem Caddy (TLS exige domínio real) e com `infra/.env.prod`
próprio (é gitignored; use `IMAGE_PREFIX=local`, `IMAGE_TAG=dev` e domínios `localhost`):

```bash
for app in api worker web; do docker build -f apps/$app/Dockerfile -t local/adpub-$app:dev .; done

cat > /tmp/override.yml <<'YAML'
services:
  api:
    environment: { S3_ENDPOINT: "http://<ip-da-máquina>:19000" }
    ports: ['14000:4000']
  worker:
    environment: { S3_ENDPOINT: "http://<ip-da-máquina>:19000" }
  web:
    environment: { WEB_URL: "http://localhost:13000" }
    ports: ['13000:3000']
  minio:
    ports: ['19000:9000']
YAML

docker compose -p adpub-local -f infra/docker-compose.prod.yml -f /tmp/override.yml \
  --env-file infra/.env.prod up -d --wait --wait-timeout 180 \
  postgres redis minio minio-init migrate api worker web
```

O IP da máquina (e não `localhost`) é o que faz o link assinado valer dos dois lados: o container
grava no MinIO e o browser abre a miniatura — em produção esse papel é do `S3_DOMAIN` no Caddy.
Para entrar sem Google: `POST /api/v1/auth/login` com o header `x-adpub-login-secret` cria o
primeiro usuário (admin) e o `mintSessionToken` de `@adpub/auth` assina a sessão do cookie
`adpub_session`.
