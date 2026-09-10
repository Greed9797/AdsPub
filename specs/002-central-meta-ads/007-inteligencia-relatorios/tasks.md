# SPEC-007 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-007-1 — Geração validada (FR-007-01..04, FR-007-06)

- [x] T-007-1a `report.ts`: monta snapshot (performance + análises) e valida saída da IA (números, refs, mídia, viés); teste puro com número inventado → bloqueia (AC-007-03).
- [x] T-007-1b Prompt `report.v1.md` + tool use forçado; teste com invoker falso.
- [x] T-007-1c Sem métricas = sem performance; sem mídia = sem causa; só-vencedores = viés (AC-007-01/02/04); teste.

## T-007-2 — Persistência e feedback (FR-007-05, FR-007-07)

- [x] T-007-2a Schema + migração: `analysis_reports`, `report_feedbacks`, `batches.source_report_id`.
- [x] T-007-2b Rotas gerar/ver/feedback/export(html,csv); relatório antigo reproduzível (AC-007-06); teste.
- [x] T-007-2c `POST .../test-drafts` cria lote draft com briefing + vínculo; sem chamada Meta (AC-007-05/008-01); teste.

## T-007-3 — UI (FR-007-05)

- [x] T-007-3a Página `/inteligencia` + e2e gerar→ver.

## Gate final SPEC-007

- [x] Gate frio completo verde + auditoria atualizada com desvios.
