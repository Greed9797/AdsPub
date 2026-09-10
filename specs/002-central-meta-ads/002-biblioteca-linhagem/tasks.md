# SPEC-002 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-002-1 — Variante imutável (FR-002-02, AC-002-01, AC-002-02)

- [x] T-002-1a Schema + migração aditiva: `creative_variants` + `ad_drafts.variant_id` (nulável).
- [x] T-002-1b `repos/variants.ts`: `getOrCreateVariant` por (cliente, fingerprint); manifesto canônico; teste: mesmo vídeo + copies diferentes = 2 variantes; mesmo conteúdo = 1 (AC-002-02); nome fora do fingerprint (AC-002-03 parcial).
- [x] T-002-1c `validateBatch` deriva e grava `variant_id`; item sem conteúdo válido fica sem variante (não inventa).

## T-002-2 — Vínculo observado (FR-002-03, FR-002-05, AC-002-04, AC-002-05, AC-002-06)

- [x] T-002-2a Schema + migração: `ad_creative_bindings` (janela, precision, motivo; unique parcial 1 ativo por item).
- [x] T-002-2b Pipeline cria vínculo `confirmed` no `done` com `meta_creative_id` + `meta_ad_id`.
- [x] T-002-2c Poller: troca de `creative_id` → fecha + abre `ambiguous_intraday`; teste com fake: sem divisão de métrica, motivo gravado (AC-002-05).
- [x] T-002-2d Assets da variante ausentes → `media_missing`; teste: sem descrição, só estado (AC-002-06).
- [x] T-002-2e Smoke: publish cria vínculo `confirmed` com composição completa (todos os asset_ids, AC-002-04).

## T-002-3 — Manual + biblioteca (FR-002-04, FR-002-06, AC-002-03)

- [x] T-002-3a `POST /ad-accounts/:id/bindings` (admin/coordinator, auditado): vínculo `manual` p/ anúncio fora do app.
- [x] T-002-3b `GET /variants?client_id&format&q` + seção em `/criativos` com filtros.
- [x] T-002-3c Smoke: vínculo manual + consulta; nomes repetidos não auto-vinculam (AC-002-03).

## Gate final SPEC-002

- [x] Gate frio completo verde + auditoria atualizada com desvios.
