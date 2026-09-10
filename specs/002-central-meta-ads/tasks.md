# SPEC-000 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-000-1 — Caracterização PAUSED (AC-000-02)

- [x] T-000-1a [FR-000-05] Estender `packages/meta-client/test/write.test.ts`: capturar corpo enviado por `createCampaign`, `createAdSet`, `createAd` via stub e afirmar `status === 'PAUSED'` + ausência de qualquer outro valor vindo de IA/DTO. Teste falha hoje por falta das asserções.
- [x] T-000-1b [FR-000-05] Teste de contrato `POST /batches/:id/publish`: schema rejeita campo `status` (strict) e nenhum caminho aceita ACTIVE. Afirma 400/422 sem efeito colateral.

## T-000-2 — Estado de reconciliação (AC-000-03, FR-000-04)

- [x] T-000-2a Teste máquina de estados (`packages/shared/test/state-machine.test.ts`): `creating_*`/`uploading_media`/`ensuring_*` → `needs_reconciliation`; de lá → `queued`|`failed`; nunca direto `published`; `deriveBatchStatus` com o estado = `partial`.
- [x] T-000-2b Schema + migração aditiva: status novo no enum, colunas de motivo/resolução anuláveis. `down` remove só o adicionado.
- [x] T-000-2c Pipeline (`apps/worker/src/publish/pipeline.ts`): classificar erro ambíguo (timeout/abort/rede sem resposta após possível create) → `needs_reconciliation` + alerta, sem retry cego. Erro transiente com resposta de falha mantém retry atual.
- [x] T-000-2d Rota operacional resolve-reconciliação (adotar `meta_ids` existentes → `queued`, ou descartar com motivo → `failed`), com auditoria ator+motivo e RBAC existente.
- [x] T-000-2e Fase no `scripts/smoke-integration.ts`: create com timeout injetado cai em reconciliação, não duplica; resolução retoma sem segundo objeto.

## T-000-3 — Fingerprint de aprovação + tempos (AC-000-04, FR-000-03, FR-000-06)

- [x] T-000-3a Schema + migração aditiva em lote (`approval_fingerprint`, `validated_at`) e item (`validated_at`, `queued_at`, `processing_started_at`, `published_at`), tudo anulável.
- [x] T-000-3b `services/validation.ts`: gravar fingerprint sha256(id+version+copy+name+refs+destino dos elegíveis) + `validated_at` ao validar.
- [x] T-000-3c `services/publish.ts`: exigir fingerprint igual + `confirm_count`; divergência → 422 `revalidar lote`. Lote sem fingerprint (antigo) → 422 pedindo validar.
- [x] T-000-3d Worker preenche `queued_at`/`processing_started_at`/`published_at` nas transições existentes; teste afirma ordem e presença.
- [x] T-000-3e e2e: validar → editar item → publicar retorna 422; revalidar → publica 202.

## Gate final SPEC-000

- [x] Gate frio completo verde (`build --force`, `typecheck --force`, `test`, `smoke:integration`, `test:e2e`, scan SC-006) + inventário atualizado com qualquer desvio.
