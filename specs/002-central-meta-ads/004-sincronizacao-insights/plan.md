# SPEC-004 — Plano técnico

**Escopo:** ler Insights e persistir como observações `source: 'api'` com
snapshot e checkpoint. Sem dashboard (005), sem comparar em UI (007 mostra
lado a lado depois). Migrações aditivas. Zero escrita na Meta.

## Decisões

1. **Cliente fino, parâmetro explícito.** `getInsights(client, adAccountId,
   {level, fields, timeIncrement, since, until, breakdowns?, actionReportTime?})`
   pagina até esgotar ou teto 20 (igual `readAllPages`); async quando
   `async: true` (cria `AdReportRun`, poll de estado com teto, baixa
   resultado). Erro de campo/breakdown inválido vira `MetaApiError`
   permanente com diagnóstico (AC-004-06), nunca zero.
2. **Snapshot é a identidade da extração.** `insight_snapshots`:
   fingerprint (conta+nível+campos+janela+atribuição+breakdowns), janela,
   `fetched_at`, `completude` (`complete|partial|failed`), páginas,
   `source_params`. Observação aponta `snapshot_id`; reextração da mesma
   célula cria snapshot novo e a canônica aponta p/ ele (relatório salvo
   continua no antigo, AC-004-03).
3. **Canônica por upsert, não soma.** Mesma (conta, nível, entidade,
   período, grain, breakdown, atribuição, fonte) → atualiza seleção p/ novo
   snapshot. Arquivo × API convivem; comparação e conflito ficam p/ motor
   (005) e relatório (007) — aqui só `GET /observations` lista com
   fonte/snapshot.
4. **Estado por conta.** `account_sync_state`: última janela diária coberta,
   janela móvel, cursor async pendente, falhas seguidas (backoff por conta;
   auth → `needs_attention` existente, sem loop).
5. **Agendamento.** Fila `adpub.insights-sync`: 2h por conta ativa (não
   pausada), janela móvel noturna (atribuição + 3d margem), backfill 90d em
   janelas de 30d via `POST /insights/sync-jobs` (202 + job). Rota de
   acompanhamento `GET /insights/sync-jobs/:id` reaproveita `publish_jobs`?
   Não — estado na `account_sync_state` + resposta 202 com escopo.

## Arquivos reais

- `packages/meta-client/src/read/insights.ts` + fixtures + testes
- `packages/db`: `insight_snapshots`, `account_sync_state`,
  `metric_observations.snapshot_id`+índice; repos `insight-snapshots.ts`
- `apps/worker/src/insights/sync.ts` + fila em `index.ts` (concorrência 1,
  separada do publish) + `GET/POST /insights/*` na API
- Fake graph: `/insights` + `adreportruns` p/ smoke; smoke ponta a ponta

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Parcial nunca vira "concluído": `completude` marca.
