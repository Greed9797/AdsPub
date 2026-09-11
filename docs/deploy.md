# Deploy de produção (host compartilhado)

Tudo o que a produção precisa está em `infra/`: `docker-compose.prod.yml` (o stack),
`Caddyfile.snippet` (as rotas no proxy que já existe no host), `.env.prod.example` (segredos) e
`backup.sh` (dump diário). O deploy é feito pelo workflow [`Deploy`](../.github/workflows/deploy.yml),
que publica as três imagens no GHCR e aplica no servidor por SSH. O runner do CI é amd64: o host
precisa ser amd64 (ou trocar `platforms` no workflow e usar buildx).

## 1. Topologia

O VPS é compartilhado com os stacks `mcrm` (dono do Caddy que termina TLS na 80/443) e
`creativeos`. **Este stack não sobe proxy nenhum e não publica porta**: `web` e `minio` entram na
rede docker do Caddy existente (`mcrm_internal`) e o roteamento é feito lá.

| Serviço | O que é | Exposto |
|---|---|---|
| `web` (`adpub-web`) | Next.js (BFF; única cara do produto) | rede `mcrm_internal`, atrás do Caddy |
| `minio` (`adpub-minio`) | storage S3 (links assinados do browser) | rede `mcrm_internal`, atrás do Caddy |
| `api` (`adpub-api`) | Fastify (contrato OpenAPI, produtor das filas) | só a rede interna |
| `worker` (`adpub-worker`) | consumidores BullMQ (único que escreve na Meta) | só a rede interna |
| `migrate` | aplica `@adpub/db` e sai (roda antes de api/worker) | — |
| `postgres` `redis` | banco e filas | só a rede interna |

Nenhuma porta de app/banco é publicada: para inspecionar a API ou o console do MinIO, use o IP
interno do container (`docker compose exec -T api hostname -i`) por um túnel SSH.

Orçamento no host compartilhado (4 vCPU, 16 GB, ~5 GB já usados pelos stacks vizinhos — `mcrm`,
`bam`, `buzz`, `openbot`, `sports-vton`, `openobserve` — com ~11 GB disponíveis e 81 GB livres em
disco): os limites de memória deste stack somam ~4,8 GB (worker 2 GB por causa de ffmpeg/ffprobe,
Postgres 1 GB, o resto ≤ 512 MB) e cada serviço escreve no máximo 3 × 10 MB de log (`json-file` com
teto — log sem limite é o jeito mais rápido de derrubar os vizinhos).

Hosts usados por padrão: `adpub.179-198-104-210.sslip.io` (app) e
`adpub-s3.179-198-104-210.sslip.io` (storage). O `sslip.io` resolve qualquer nome que embuta o IP
do servidor, então isso dá TLS válido sem tocar no DNS. Quando houver domínio próprio, troque
`APP_DOMAIN`/`S3_DOMAIN` no `.env.prod`, os dois blocos do `Caddyfile.snippet` e recarregue o Caddy.

## 2. Segredos

| Variável | Como gerar / obter |
|---|---|
| `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` | `openssl rand -hex 24` (hex não quebra URL) |
| `MASTER_KEY` | `openssl rand -base64 32` — 32 bytes em base64, **fora do banco**; trocar depois invalida os tokens cifrados (é preciso reconectar) |
| `AUTH_SECRET` | `openssl rand -hex 32` — assina a sessão e o login interno |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client do Google Cloud com redirect URI `https://APP_DOMAIN/api/auth/callback` |
| `META_APP_ID` / `META_APP_SECRET` | painel do app Meta (mesmo app do App Review) |
| `ANTHROPIC_API_KEY` | console da Anthropic |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (opcional) | bot do @BotFather e o id do chat; os dois juntos (docs/piloto-e-rollout.md §1.1) |

O `.env.prod` vive **só no servidor** (`chmod 600`) — nunca no repositório. O CI já roda `gitleaks`.

## 3. Preparar o host (uma vez)

```bash
# 1) Usuário, pasta e segredos (rode como root; depois siga como `deploy`):
adduser --disabled-password --gecos '' deploy && usermod -aG docker,sudo deploy
mkdir -p ~/.ssh && chmod 700 ~/.ssh   # cole a chave pública do CI em authorized_keys
mkdir -p /opt/adpub && cd /opt/adpub
# da máquina com o repositório:
scp infra/docker-compose.prod.yml infra/Caddyfile.snippet infra/backup.sh deploy@servidor:/opt/adpub/
scp infra/.env.prod.example deploy@servidor:/opt/adpub/.env.prod   # e edite no servidor
chmod 600 .env.prod

# 2) Rotas no Caddy do mcrm (o snippet acabou de chegar). Uma vez só: repetir o
#    `>>` duplicaria os blocos e o Caddy recusaria a config.
sudo cp /opt/mcrm/Caddyfile /opt/mcrm/Caddyfile.bak.adpub.$(date +%F)
sudo sh -c 'cat /opt/adpub/Caddyfile.snippet >> /opt/mcrm/Caddyfile'
docker exec mcrm-caddy-1 caddy reload --config /etc/caddy/Caddyfile   # `deploy` está no grupo docker

# 3) Conferências que evitam a falha silenciosa:
docker network inspect mcrm_internal >/dev/null && echo 'rede do proxy ok'
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'mcrm|creativeos'   # vizinhos no ar?
free -m    # sobra RAM para ~4,8 GB de teto?

# 4) Para puxar imagem privada do GHCR (PAT com read:packages):
echo "$GHCR_PAT" | docker login ghcr.io -u <usuário> --password-stdin
```

No host atual só existe `root` (os stacks vizinhos rodam assim; não há usuário `deploy`): crie o
`deploy` como acima ou use `DEPLOY_USER=root` ciente do risco. O login do GHCR também pode ser
feito pelo CI: crie o secret `GHCR_PAT` (PAT com `read:packages`) e o workflow faz o
`docker login` no servidor por stdin antes do `pull`; sem esse secret ele assume pacotes públicos.

Preencha o `.env.prod` antes do primeiro deploy: domínios, senhas, `MASTER_KEY`, `AUTH_SECRET`,
Google, Meta e Anthropic. `IMAGE_TAG` pode ficar em `latest` até o primeiro deploy do CI (o
workflow exporta o sha do commit — variável de shell vence o `--env-file`). As portas 80/443 já
estão abertas e resolvidas pelo stack `mcrm` — **não** mexa no `ufw` dele nem suba um segundo
proxy. Se o `caddy reload` reclamar que `adpub-web` não resolve, suba o stack (§4) e recarregue
depois: o Caddy resolve o upstream a cada requisição, não no carregamento.

## 4. Primeiro deploy

O repositório ainda **não tem remote no GitHub**, então o caminho é construir as imagens no próprio
host (o workflow `Deploy` fica pronto para quando houver remote):

```bash
# da máquina com o repositório:
HOST=w3vps ./infra/deploy-host.sh
```

O script confere o `.env.prod` e a rede do proxy, sincroniza o código para `/opt/adpub/app`
(rsync com `--delete`, sem `node_modules`/`.next`), constrói
`adpub/adpub-{api,worker,web}:<sha-curto>` no host, roda `migrate` e aplica
`up -d --wait --wait-timeout 180`. Aceita `HOST` (padrão `w3vps`), `DEST` (padrão `/opt/adpub`) e
`IMAGE_PREFIX` (padrão `adpub` — namespace local, nada vai para registry).

O `up -d --wait` só retorna quando todos os contêineres estão de pé e saudáveis. Ele sobe
Postgres/Redis/MinIO (com volume próprio), cria o bucket (`minio-init`), aplica as migrações
(`migrate`) e só então sobe `api`, `worker` e `web`. O certificado dos hosts sai na primeira
requisição que passa pelo Caddy do `mcrm`.

Equivalente manual, no servidor (`/opt/adpub`), quando as imagens já existem:

```bash
export IMAGE_PREFIX=adpub IMAGE_TAG=<sha>
docker compose -f docker-compose.prod.yml --env-file .env.prod run -T --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait --wait-timeout 180
```

Com o repositório publicado no GitHub, os deploys passam a ser pelo workflow: **Actions → Deploy →
Run workflow** (ou publique uma tag `v*`) — ele publica as três imagens no GHCR e aplica por SSH.
Segredos/variáveis do repositório: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`; opcionais
`DEPLOY_PORT`, `DEPLOY_PATH` (`/opt/adpub` por padrão) e `GHCR_PAT` (`read:packages`, para o host
puxar imagem privada).

## 5. Verificação pós-deploy

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://APP_DOMAIN/login          # 200
curl -fsS -o /dev/null -w '%{http_code}\n' https://S3_DOMAIN/minio/health/live  # 200

cd /opt/adpub
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
      aparece — é o caminho dos links assinados passando pelo Caddy do `mcrm`.
- [ ] Alertas chegam no Telegram, se configurado (`./backup.sh` também serve de teste de fumaça).
- [ ] `/saude` sem conta em "Requer atenção" e filas vazias (`GET /ops/metrics`).
- [ ] Backup roda: `./backup.sh` e confira os arquivos.

## 6. Migrações e banco

As migrações rodam no serviço `migrate` a cada deploy, antes de `api`/`worker`. O histórico local
foi recriado do zero várias vezes, então a conferência contra um banco limpo faz parte do primeiro
deploy: `drizzle.__drizzle_migrations` precisa listar as migrações na ordem de
`packages/db/migrations/meta/_journal.json` e o `migrate` precisa terminar com exit 0.

Rollback de aplicação (a imagem volta, o schema **não**):

```bash
cd /opt/adpub
IMAGE_TAG=<sha-anterior> docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Se a release tiver migração destrutiva, o rollback é o restore do dump (`docs/restore.md`).

## 7. Backup

`infra/backup.sh` (o CI copia para `/opt/adpub`) faz `pg_dump` + espelho do bucket. Ele entra na
rede `adpub_internal` pelo nome, então o `name:` dessa rede no compose não pode mudar à toa:

```cron
# /etc/cron.d/adpub-backup
30 3 * * * deploy cd /opt/adpub && ./backup.sh /var/backups/adpub >> /var/log/adpub-backup.log 2>&1
0 4 * * * deploy find /var/backups/adpub -type f -mtime +30 -delete
```

Restore: `docs/restore.md`. Teste o restore pelo menos uma vez antes do piloto.

## 8. Operação

| Situação | Comando (no servidor, em `/opt/adpub`) |
|---|---|
| Ver contêineres | `docker compose -f docker-compose.prod.yml --env-file .env.prod ps` |
| Logs de um serviço | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker` |
| Reiniciar após mudar o `.env.prod` | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d` |
| Desligar uma área nova (rollback de flag) | `FEATURE_X=0` no `.env.prod` + `up -d web` |
| Console do MinIO | túnel SSH para `<ip-do-container>:9001` |
| Trocar rotas/hosts no proxy | editar `/opt/mcrm/Caddyfile` + `docker exec mcrm-caddy-1 caddy reload --config /etc/caddy/Caddyfile` |
| Ver quem está na rede do proxy | `docker network inspect mcrm_internal --format '{{range .Containers}}{{.Name}} {{end}}'` |

Trocar `META_TIER=limited → full` (depois do App Review) é `.env.prod` + `up -d worker api`.

## 9. Testar o stack de produção localmente

O mesmo compose sobe na máquina de dev — sem o Caddy (TLS exige domínio real) e com
`infra/.env.prod` próprio (é gitignored; use `IMAGE_PREFIX=local`, `IMAGE_TAG=dev`, domínios
`localhost` e `PROXY_NETWORK=adpub-local-proxy`) — mas a rede externa precisa existir:

```bash
docker network create adpub-local-proxy >/dev/null 2>&1 || true   # o compose valida a rede
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
