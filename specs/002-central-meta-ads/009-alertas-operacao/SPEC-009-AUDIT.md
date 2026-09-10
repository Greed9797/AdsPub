# SPEC-009 — Auditoria: alertas e operação

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-008 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| Alerta token/permissão/falha lote/rate-limit/reconciliação/sync-parcial | implementado | `createAlerter` + chamadas pontuais (sem loop) |
| Alerta sync atrasado, falta de mídia, conflito de fontes | ausente | — |
| Regra versionada + amostra + período + confusão | ausente | fadiga não existe |
| Dedup por regra/conta/entidade/janela + ack/resolve | ausente | cada evento dispara |
| Concorrência separada publish × vídeo/IA | parcial | `insights-sync` separada; análise é síncrona na API (sem worker) |
| Medir fila/retries/custo/duração por conta | parcial | health tem jobs/erros/latência; sem custo IA nem profund. fila |
| Restore banco/arquivos + retomada segura | ausente | retomada de jobs existe; restore nunca demonstrado |
| Feature flags p/ desligar inteligência | ausente | — |
| Métricas 80/dia, tempo humano, <2% falha, auditoria 100% | parcial | SC-003/005 SQL no piloto; sem endpoint |
| Rollout gradual + rollback | parcial | `piloto-e-rollout.md` do MVP; sem áreas novas |

## Decisões (para o plano)

- `alert_rules` (versionadas, em código + seed) + `alert_events`
  (fingerprint, janela, estado open/ack/resolved). `dedupAlert` envolve o
  alerter existente: mesma regra+entidade+janela = 1 alerta.
- Fadiga como regra v1 em `@adpub/analytics`: CPA sobe X% vs janela
  anterior equivalente, volume mínimo, com confusão listada — informativa.
- Flags via env (`FEATURE_REPORTS/INSIGHTS/AI_ANALYSIS`): rota desligada =
  503 com motivo; publish nunca depende delas (teste desliga tudo e publica).
- `GET /ops/metrics`: filas (BullMQ counts), custo IA, falhas terminais
  (<2%), auditoria (% com trilha), tempo humano (proxy SQL). Restore:
  runbook `docs/restore.md` (pg_dump + MinIO + retomada) — demonstração
  real fica p/ operação (sem apagar banco aqui).
- Rollout: estende `piloto-e-rollout.md` com ondas das áreas novas.
