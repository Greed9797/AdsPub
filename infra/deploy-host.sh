#!/usr/bin/env bash
# Deploy no host compartilhado SEM GitHub Actions: sincroniza o código para
# $DEST/app, constrói as três imagens lá e aplica o stack. É o caminho que
# funciona enquanto o repositório não tem remote; depois de publicá-lo, o
# workflow `Deploy` (.github/workflows/deploy.yml) faz o mesmo pelo GHCR.
#
# Uso (da máquina local, na raiz do repositório):
#   HOST=w3vps ./infra/deploy-host.sh
#
# Variáveis: HOST (host/alias ssh, padrão w3vps), DEST (padrão /opt/adpub) e
# IMAGE_PREFIX (padrão adpub — só um namespace local, nada é enviado a registry).
set -euo pipefail

HOST="${HOST:-w3vps}"
DEST="${DEST:-/opt/adpub}"
PREFIX="${IMAGE_PREFIX:-adpub}"
TAG="$(git rev-parse --short HEAD)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$DEST/app"

ssh "$HOST" "test -f '$DEST/.env.prod' || { echo \"FALHOU: falta $DEST/.env.prod (docs/deploy.md §2)\" >&2; exit 1; }
  docker network inspect mcrm_internal >/dev/null || { echo 'FALHOU: rede mcrm_internal ausente — o stack mcrm está no ar? (docs/deploy.md §3)' >&2; exit 1; }
  mkdir -p '$APP'"

echo "== sincronizando $HERE → $HOST:$APP"
# `--delete` mantém a cópia idêntica ao repositório (arquivo removido aqui some
# lá). node_modules/.next/.turbo/dist ficam de fora: as imagens constroem do zero
# e isso é ~1,7 GB de lixo de build local. `.env.prod` nunca sai daqui.
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.turbo' \
  --exclude 'dist' --exclude 'test-results' --exclude 'playwright-report' \
  --exclude 'tmp' --exclude '.env.prod' \
  "$HERE/" "$HOST:$APP/"

echo "== levando compose, snippet do Caddy e backup"
scp -q "$HERE/infra/docker-compose.prod.yml" "$HERE/infra/Caddyfile.snippet" "$HERE/infra/backup.sh" "$HOST:$DEST/"
ssh "$HOST" "chmod +x '$DEST/backup.sh'"

echo "== construindo imagens no host (tag $TAG)"
ssh "$HOST" "set -e
  cd '$APP'
  prefix='$PREFIX'; tag='$TAG'
  for app in api worker web mcp; do
    echo \"-- \$app:\$tag\"
    docker build -f apps/\$app/Dockerfile -t \"\$prefix/adpub-\$app:\$tag\" .
  done"

echo "== migrando e subindo"
ssh "$HOST" "set -e
  cd '$DEST'
  export IMAGE_PREFIX='$PREFIX' IMAGE_TAG='$TAG'
  docker compose -f docker-compose.prod.yml --env-file .env.prod run -T --rm migrate
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait --wait-timeout 180
  docker compose -f docker-compose.prod.yml --env-file .env.prod ps"

echo
echo "== pronto (tag $TAG). Se é o primeiro deploy: anexe o Caddyfile.snippet ao"
echo "   /opt/mcrm/Caddyfile uma vez e recarregue o Caddy (docs/deploy.md §3)."
