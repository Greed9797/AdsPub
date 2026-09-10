# SPEC-004 — Auditoria: sincronização Meta Insights

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-003 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| Leitura de objetos no escopo (incl. fora do app) | implementado | `runSync`: contas, páginas, IGs, pixels, campanhas/conjuntos (`sync/connection.ts`) |
| Paginação completa | implementado | `readAllPages` (limite 100, teto 20 págs, cursor `after`) |
| Insights síncrono/assíncrono | implementado (T-004-1) | `read/insights.ts` + fixtures + testes; inválido vira erro permanente |
| Checkpoints + parâmetros persistidos | implementado (T-004-2/3) | `insight_snapshots` + `account_sync_state`; parâmetros no snapshot |
| Bruto vs observação vs canônica | implementado (T-004-2) | fonte `api` + `snapshot_id`; upsert canônico, histórico no snapshot |
| Backfill 90d + janelas móveis por atribuição | implementado (T-004-3) | `POST /insights/sync-jobs` (3×30d) + `movingWindow()`; fila própria |
| Agendamento/concorrência por conta + quota + backoff | implementado (T-004-3) | fila `adpub.insights-sync` separada; falhas seguidas no estado; auth segue `needs_attention` |
| Falhas resolvíveis (fila) | parcial (aceito) | estado + alerta + retry BullMQ; fila dedicada de falhas fica p/ SPEC-009 |
| Datasets com/sem breakdown separados | implementado | `breakdownSignature` na chave; sem breakdown ≠ com breakdown |
| Comparação arquivo×API sem somar | parcial | fontes coexistem + `GET /observations` com fonte; lado a lado fica p/ SPEC-007 |

## Decisões de projeto (para o plano)

- Insights no `meta-client/read/insights.ts`: `getInsights` (paginado,
  `time_increment` configurável) + `startReportRun`/`getReportRun`/
  `fetchReportResult` (async). Parâmetros persistidos no snapshot.
- Tabelas: `insight_snapshots` (fingerprint da consulta + janela +
  `fetched_at` + completude + cursor) e `account_sync_state` (checkpoint por
  conta: última janela, cursor async, falhas seguidas). Observações ganham
  `source: 'api'` + `snapshot_id` (colunas aditivas).
- Canônica: mesma chave §3 + mesma fonte → `upsert` (snapshot novo vence,
  histórico preservado por `snapshot_id`); fontes distintas nunca se somam.
- Agendamento: sync objetos segue 6h; insights 2h por conta ativa + janela
  móvel noturna por atribuição (7d + margem); backfill 90d em janelas de 30d
  sob demanda (rota + worker), com checkpoint por janela.
- Fila: reutilizar `adpub.sync` com `job: 'insights'` interno? Não — fila
  nova `adpub.insights-sync` (nome proposto no pacote) com concorrência
  separada p/ não travar publish (SPEC-009 cobra separação).
