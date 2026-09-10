# SPEC-004 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-004-1 — Cliente Insights (FR-004-01, FR-004-02)

- [x] T-004-1a `read/insights.ts`: `getInsights` paginado (todas as páginas ou `partial`), params de atribuição/base temporal; teste com fixtures (2 páginas).
- [x] T-004-1b Async: `startReportRun`/`getReportRun`/`fetchReportResult` com teto de espera + estado; teste com fixtures.
- [x] T-004-1c Campo/breakdown inválido → erro permanente com diagnóstico, nunca zero (AC-004-06); teste.

## T-004-2 — Snapshots e canônica (FR-004-03, FR-004-04)

- [x] T-004-2a Schema + migração: `insight_snapshots`, `account_sync_state`, `metric_observations.snapshot_id`.
- [x] T-004-2b Upsert canônico: mesma célula+fonte aponta p/ snapshot novo, histórico preservado; teste (AC-004-03).
- [x] T-004-2c `GET /observations` (filtros conta/período/fonte) e `GET /insights/sync-jobs` estado por conta.

## T-004-3 — Worker e agendamento (FR-004-05, FR-004-06, FR-004-07)

- [x] T-004-3a Fila `adpub.insights-sync` (concorrência separada) + `POST /insights/sync-jobs` (backfill 90d em janelas 30d, checkpoint por janela).
- [x] T-004-3b Janela móvel noturna por atribuição + backoff por conta (falhas seguidas); auth segue `needs_attention` sem loop.
- [x] T-004-3c Smoke: sync 2 páginas + async + reinício retoma sem duplicar canônica (AC-004-01/02); falha numa conta não trava outras (AC-004-05); sync nunca muta entrega (AC-004-07).
- [x] T-004-3d Datasets com/sem breakdown separados; comparação exige recorte equivalente (AC-004-04 coberto por teste de reconciliação de amostra).

## Gate final SPEC-004

- [x] Gate frio completo verde + auditoria atualizada com desvios.
