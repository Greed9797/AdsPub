# SPEC-009 — Plano técnico

**Escopo:** dedup, fadiga, flags, métricas operacionais, runbook restore,
rollout das áreas novas. Sem canal externo novo, sem automação financeira.
Migração aditiva.

## Decisões

1. **Dedup no banco, não na memória.** `alert_events(rule, account_id,
   entity, fingerprint, window_start, state)`; `dedupAlert` abre só sem
   `open` na janela; `ack/resolve` por rota. Regras seed em código
   (`alert-rules.ts` versionadas: `sync-stale.v1`, `connection.v1`,
   `batch-failures.v1`, `reconciliation.v1`, `fatigue.v1`,
   `insights-partial.v1`).
2. **Fadiga em analytics.** `detectFatigue(series, rule)`: janelas
   equivalentes, CPA +X%, gasto mínimo, impressões mínimas; saída com
   regra, amostra, período e confusão. Informativa — nunca muta Meta.
3. **Flags matam inteligência, nunca publish.** `FEATURE_AI_ANALYSIS`,
   `FEATURE_REPORTS`, `FEATURE_INSIGHTS`: rotas 503 + UI esconde link.
   Teste: tudo off, lote publica normal.
4. **`GET /ops/metrics` (admin).** Filas via `Queue.getJobCounts`,
   custo IA (`ai_generations`), taxa falha terminal, cobertura auditoria,
   proxy tempo humano. Rollback = reverter commit + flags.
5. **Restore é runbook.** `docs/restore.md`: pg_dump/MinIO, retomada de
   jobs por checkpoint (lease, step, outbox), validação pós-restore.
   Piloto doc ganha ondas 009 (flags on por conta).

## Arquivos reais

- `packages/db`: `alert_rules`? Regras em código; tabela só `alert_events`
- `apps/api`: `services/alerts.ts` (dedup), rotas ack/resolve + `/ops/metrics`,
  middleware de flags; `apps/web`: esconder links + página `/ops` mínima?
  Página não — endpoint + doc bastam; UI mostra badge? Fora: doc.
- `packages/analytics`: `fatigue.ts` + testes; smoke dedup + flags + métricas.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Alerta observacional nunca autoriza automação.
