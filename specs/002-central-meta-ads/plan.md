# SPEC-000 — Plano técnico (só correções, sem nova feature)

**Escopo:** fechar T-000-1..T-000-3 do inventário. Sem dashboard, importador, sync Insights ou IA nova. Migrações só aditivas. Nenhum anúncio ACTIVE em nenhum caminho.

## Decisões

1. **PAUSED por construção, não por convenção.** Adapter continua sem campo `status` nos DTOs; teste de caracterização trava corpo enviado (T-000-1). Rejeição explícita desnecessária onde o campo nem existe — teste prova ausência do caminho.
2. **Reconciliação como estado, não como retry esperto.** Novo status `needs_reconciliation` no pipeline: timeout/erro ambíguo após possível create externo sai do loop de retry e exige resolução operacional (adotar ID existente ou descartar com motivo). Transições: etapas in-flight → `needs_reconciliation`; de lá → `queued` (reconciliado, com `meta_ids` adotados) ou `failed` (descartado com motivo). `deriveBatchStatus` conta como `partial`, nunca `done`. UI mostra motivo + ação. (T-000-2)
3. **Aprovação = fingerprint, não contagem.** `validateBatch` grava no lote `approval_fingerprint = sha256(itens elegíveis: id+version+copy+name+refs+destino)` + `validated_at`. `publishBatch` exige fingerprint igual ao atual + `confirm_count`; divergência → 422 pedindo revalidar. `patchDraft` já recalcula status; fingerprint muda junto via `version`. Campos novos anuláveis, backfill nulo = lote antigo exige validar de novo. (T-000-3)
4. **Tempos de estágio como colunas, não inferência.** `validated_at`, `queued_at`, `processing_started_at`, `published_at` no item (anuláveis, aditivos). Worker preenche nas transições que já existem. Serve FR-000-06 e métricas SC-005/O1 sem mudar fluxo.

## Arquivos reais tocados

- T-000-1: `packages/meta-client/test/write.test.ts` (assert corpos PAUSED via stub), sem código produto.
- T-000-2: `packages/shared/src/enums.ts` + `state-machine.ts` (status + transições), `packages/db/src/schema.ts` + migração aditiva, `apps/worker/src/publish/pipeline.ts` (classificar erro ambíguo: timeout/abort/rede sem resposta), `apps/api/src/routes/batches.ts` (rota resolve), smoke fase nova em `scripts/smoke-integration.ts`.
- T-000-3: `packages/db/src/schema.ts` + migração aditiva (`approval_fingerprint`, `validated_at`, 4 timestamps), `apps/api/src/services/validation.ts` + `publish.ts`, teste serviço, e2e cobre 422 após edit.

## O que NÃO fazer

Reescrever publicador, tocar lease/R3, mudar filas, criar pacotes reporting/analytics, sync Insights, CSV, IA. Revalidação de token no worker fica como gap documentado para SPEC-001 (FR-001-06), fora deste plano.

## Gates por tarefa

Cada tarefa: teste que falha → implementação mínima → gate (`build`, `lint`, `typecheck`, `test`, `smoke:integration`, `test:e2e`) → evidência no PR. Rollback = reverter commit + migração `down` (só colunas anuláveis novas, sem perda).
