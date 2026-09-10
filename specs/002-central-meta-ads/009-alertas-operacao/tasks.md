# SPEC-009 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-009-1 — Dedup e regras (FR-009-01, FR-009-03)

- [x] T-009-1a Tabela `alert_events` + `dedupAlert` + rotas ack/resolve; teste: mesmo incidente = 1 alerta; retry não realerta (AC-009-02).
- [x] T-009-1b Regras versionadas `sync-stale/connection/batch-failures/reconciliation/insights-partial`; sync atrasado e falta de mídia alertam (FR-009-01).

## T-009-2 — Fadiga (FR-009-02)

- [x] T-009-2a `detectFatigue` em analytics + teste (regra, amostra, período, confusão; sem volume = sem alerta).
- [x] T-009-2b Checagem no sync de insights? Não — job separado? Mínimo: avaliado no `GET /performance`? Não. Detector roda no worker insights após sync da conta, alerta informativo (AC-009-03: nunca muta).

## T-009-3 — Flags, métricas, restore (FR-009-04..07)

- [x] T-009-3a Flags `FEATURE_AI_ANALYSIS/FEATURE_REPORTS/FEATURE_INSIGHTS` (env): rotas 503, UI esconde; teste tudo-off publica normal (AC-009-05).
- [x] T-009-3b `GET /ops/metrics` (filas, custo IA, <2% falha, auditoria, tempo humano); teste via smoke (AC-009-01/04/06/07).
- [x] T-009-3c `docs/restore.md` + ondas 009 em `piloto-e-rollout.md` (AC-009-04/07).

## Gate final SPEC-009

- [x] Gate frio completo verde + auditoria atualizada com desvios.
