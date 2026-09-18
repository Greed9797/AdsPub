#!/usr/bin/env bash
# Deploy no host compartilhado SEM GitHub Actions: sincroniza o código para
# $DEST/app, constrói as três imagens lá e aplica o stack. É o caminho que
# funciona enquanto o repositório não tem remote; depois de publicá-lo, o
# workflow `Deploy` (.github/workflows/deploy.yml) faz o mesmo pelo GHCR.
#
# Uso (da máquina local, na raiz do repositório):
#   HOST=w3vps ./infra/deploy-host.sh
#   HOST=w3vps DEPLOY_PHASE=prepare ./infra/deploy-host.sh
#   HOST=w3vps DEPLOY_PHASE=activate ./infra/deploy-host.sh
#   HOST=w3vps OPENCODE_ENABLED=1 DEPLOY_PHASE=prepare ./infra/deploy-host.sh
#
# Variáveis: HOST (host/alias ssh, padrão w3vps), DEST (padrão /opt/adpub),
# IMAGE_PREFIX (padrão adpub — só um namespace local, nada é enviado a
# registry), DEPLOY_PHASE (prepare|activate, padrão prepare) e
# OPENCODE_ENABLED=1 (ambiente Go: worker com CLI OpenCode pinada + overlay).
set -euo pipefail

HOST="${HOST:-w3vps}"
DEST="${DEST:-/opt/adpub}"
PREFIX="${IMAGE_PREFIX:-adpub}"
TAG="$(git rev-parse --short HEAD)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$DEST/app"

# CLI OpenCode pinada pela qualificação (etapa 3, sem `latest`).
OPENCODE_VERSION="1.18.30"
OPENCODE_SHA256="55007246858165496ff85ba1c2b648f7421e8e2013bf4189a680c9ff8e699d17"
OPENCODE_ENABLED="${OPENCODE_ENABLED:-0}"

# Fase: prepare constrói, activate corta. Qualquer outro valor aborta ANTES
# de qualquer SSH.
DEPLOY_PHASE="${DEPLOY_PHASE:-prepare}"
case "$DEPLOY_PHASE" in
  prepare|activate) ;;
  *) echo "FALHOU: DEPLOY_PHASE deve ser prepare|activate (recebido: $DEPLOY_PHASE)" >&2; exit 1;;
esac

# HOST/DEST: destinos vazios ou relativos derrubariam o lugar errado; o
# `--delete` do rsync só varre $APP, então DEST=/ ou APP==DEST é recusa.
case "$HOST" in ''|*[[:space:]]*) echo "FALHOU: HOST inválido" >&2; exit 1;; esac
case "$DEST" in /*) ;; *) echo "FALHOU: DEST deve ser caminho absoluto (recebido: $DEST)" >&2; exit 1;; esac
if [ "$DEST" = "/" ] || [ "$APP" = "$DEST" ]; then
  echo "FALHOU: DEST fora do escopo de deploy ($DEST)" >&2; exit 1
fi
# Segredos ($DEST/secrets, $DEST/.env.prod) e volumes (docker volumes, fora de
# $DEST/app) nunca entram no escopo do --delete, que é só $APP.

# Preflight: árvore precisa estar limpa — o deploy etiqueta imagens com HEAD,
# mas o rsync levaria arquivos não commitados junto sem ninguém perceber.
if [ -n "$(git -C "$HERE" status --porcelain)" ]; then
  echo "FALHOU: working tree sujo — commite ou descarte antes do deploy" >&2
  git -C "$HERE" status --short >&2
  exit 1
fi

COMPOSE_FILES="-f docker-compose.prod.yml"
if [ "$OPENCODE_ENABLED" = "1" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.opencode.yml"
fi

if [ "$DEPLOY_PHASE" = "prepare" ]; then
  ssh "$HOST" "test -f '$DEST/.env.prod' || { echo \"FALHOU: falta $DEST/.env.prod (docs/deploy.md §2)\" >&2; exit 1; }
    docker network inspect mcrm_internal >/dev/null || { echo 'FALHOU: rede mcrm_internal ausente — o stack mcrm está no ar? (docs/deploy.md §3)' >&2; exit 1; }
    mkdir -p '$APP'"

  echo "== sincronizando $HERE → $HOST:$APP"
  # `--delete` mantém a cópia idêntica ao repositório (arquivo removido aqui
  # some lá), restrito a $APP. node_modules/.next/.turbo/dist ficam de fora:
  # as imagens constroem do zero e isso é ~1,7 GB de lixo de build local.
  # Segredos/credenciais locais nunca saem daqui (só *.example viaja).
  rsync -az --delete \
    --include '*.example' \
    --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.turbo' \
    --exclude 'dist' --exclude 'test-results' --exclude 'playwright-report' \
    --exclude 'tmp' --exclude '.env' --exclude '.env.*' --exclude '.env.prod' \
    --exclude 'e2e/.artifacts/' --exclude '*.log' --exclude 'logs/' --exclude 'sessions/' \
    --exclude 'secrets/' --exclude '*.pem' \
    "$HERE/" "$HOST:$APP/"

  echo "== levando compose, snippet do Caddy e backup"
  scp -q "$HERE/infra/docker-compose.prod.yml" "$HERE/infra/Caddyfile.snippet" "$HERE/infra/backup.sh" "$HOST:$DEST/"
  if [ "$OPENCODE_ENABLED" = "1" ]; then
    scp -q "$HERE/infra/docker-compose.opencode.yml" "$HOST:$DEST/"
  fi
  ssh "$HOST" "chmod +x '$DEST/backup.sh'"

  echo "== construindo imagens no host (tag $TAG)"
  ssh "$HOST" "set -e
    cd '$APP'
    prefix='$PREFIX'; tag='$TAG'
    for app in api web mcp; do
      echo \"-- \$app:\$tag\"
      docker build -f apps/\$app/Dockerfile -t \"\$prefix/adpub-\$app:\$tag\" .
    done
    echo '-- worker:'\$tag
    if [ '$OPENCODE_ENABLED' = '1' ]; then
      docker build -f apps/worker/Dockerfile --target runner-opencode \
        --build-arg OPENCODE_VERSION='$OPENCODE_VERSION' \
        --build-arg OPENCODE_SHA256='$OPENCODE_SHA256' \
        -t \"\$prefix/adpub-worker:\$tag\" .
    else
      docker build -f apps/worker/Dockerfile -t \"\$prefix/adpub-worker:\$tag\" .
    fi"
  # LOW-(g): grava tag+backend do prepare; o activate recusa divergência
  # (troca silenciosa de backend ou HEAD entre fases vira falha alta).
  ssh "$HOST" "printf '%s %s\n' '$TAG' '$OPENCODE_ENABLED' > '$DEST/.deploy-backend'"

  echo
  echo "== prepare pronto (tag $TAG). Nenhuma migração nem subida executada."
  echo "   Gates manuais antes do activate: janela anunciada, backup comprovado,"
  echo "   novos trabalhos bloqueados e filas em voo drenadas."
  exit 0
fi

# ---- activate: sem sync/rebuild; só migrate/up sobre as imagens do prepare.
echo "== activate (tag $TAG)"
echo "   Gates manuais esperados como já cumpridos: janela, backup comprovado,"
echo "   bloqueio de novos trabalhos e drenagem das filas em voo."
ssh "$HOST" "set -e
  cd '$DEST'
  # LOW-(g): activate só corta o que o prepare construiu — tag ou backend
  # diferentes (novo commit, flag trocada) exigem prepare novo, nunca corte.
  want=\"\$(cat .deploy-backend 2>/dev/null || true)\"
  [ \"\$want\" = \"$TAG $OPENCODE_ENABLED\" ] || { echo \"FALHOU: prepare registrou [\$want], activate pede ['$TAG' '$OPENCODE_ENABLED'] — rode o prepare de novo\" >&2; exit 1; }
  prefix='$PREFIX'; tag='$TAG'
  for app in api worker web mcp; do
    docker image inspect \"\$prefix/adpub-\$app:\$tag\" >/dev/null || { echo \"FALHOU: imagem \$prefix/adpub-\$app:\$tag ausente — rode o prepare\" >&2; exit 1; }
  done
  export IMAGE_PREFIX='$PREFIX' IMAGE_TAG='$TAG'
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES --env-file .env.prod run -T --rm migrate
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES --env-file .env.prod up -d --wait --wait-timeout 180
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES --env-file .env.prod ps"

echo
echo "== pronto (tag $TAG). Se é o primeiro deploy: anexe o Caddyfile.snippet ao"
echo "   /opt/mcrm/Caddyfile uma vez e recarregue o Caddy (docs/deploy.md §3)."
