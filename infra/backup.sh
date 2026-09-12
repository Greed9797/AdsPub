#!/usr/bin/env bash
# Backup diário do Postgres e do MinIO. Roda no servidor, na pasta do compose:
#
#   ./backup.sh [/var/backups/adpub]
#
# Agende no cron (docs/deploy.md §7). Restore: docs/restore.md.
set -euo pipefail
cd "$(dirname "$0")"

dest="${1:-/var/backups/adpub}"
mkdir -p "$dest"
stamp="$(date +%F)"

set -a
# shellcheck disable=SC1091
. ./.env.prod
set +a
export S3_BUCKET="${S3_BUCKET:-adpub}"

docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U adpub -Fc adpub | gzip > "$dest/postgres-$stamp.dump.gz"
rm -f "$dest/postgres-$stamp.dump" # caso um dump cru de execução antiga exista

docker run --rm --network adpub_internal \
  --entrypoint /bin/sh \
  -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e S3_BUCKET \
  -v "$dest:/backup" quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z \
  -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null &&
      mc mirror --overwrite "local/$S3_BUCKET" /backup/minio'

echo "backup ok: $dest/postgres-$stamp.dump.gz + $dest/minio/"
