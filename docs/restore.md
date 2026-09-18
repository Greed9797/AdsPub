# Restore e recuperação (SPEC-009)

Backup (operação, fora do app):

```bash
pg_dump "$DATABASE_URL" -Fc -f adpub-$(date +%F).dump
mc mirror minio-local/adpub ./minio-backup/adpub/   # ou aws s3 sync
```

Restore:

```bash
pg_restore -d "$DATABASE_URL" adpub-<data>.dump
mc mirror ./minio-backup/adpub/ minio-local/adpub/
pnpm db:migrate   # garante schema da versão deployada
```

Retomada segura (por checkpoint, sem replay cego):

- Publish: item retoma em `publish_jobs.step` + `meta_ids`; lease de dono
  morto expira e o job reentra; ambíguo vai p/ `needs_reconciliation`
  (nunca recria). BullMQ com `attempts` limitado; `UnrecoverableError`
  encerra reconciliação/autorização sem gastar tentativa.
- Escrita registrada antes de sair (`meta_writes`): morte do processo entre o
  POST e a persistência do ID deixa a linha sem `resolved_at`. Item e ref
  compartilhada param em `needs_reconciliation` em vez de recriar; a decisão
  humana (`/items/:id/resolve`, `/refs/:key/resolve`) encerra a escrita e
  libera a retomada. Pendências: `select * from meta_writes where resolved_at
  is null`.
- Insights: `account_sync_state` + snapshots; reextração faz upsert
  canônico, sem duplicar.
- Sync objetos: full-scan idempotente (upserts).
- Redis perdido: jobs somem, dados ficam. Reenfileire pelo estado do banco
  (`queued`/in-flight presos: `markDraftsQueued` só move `ready`/`failed` —
  in-flight após queda volta p/ `queued` via reconciliação manual ou
  revalidação; nunca replay cego de create).

Validação pós-restore: gate frio (`build --force`, `typecheck --force`,
`test`, `smoke:integration`, `test:e2e`) + `GET /ops/metrics`
(falha terminal < 2%, filas zeradas).
