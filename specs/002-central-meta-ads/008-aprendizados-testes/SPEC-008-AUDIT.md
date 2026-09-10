# SPEC-008 — Auditoria: aprendizados e testes

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-007 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| Salvar aprendizado com origem/hipótese/evidência | ausente | feedback é nota solta, sem estrutura |
| Gerar briefing de teste do relatório | ausente | rascunho recebe briefing manual |
| Rascunho no publicador sem Meta direta | implementado | `POST .../test-drafts` (T-007-2c) |
| Vincular variante proposta/controle/métrica | ausente | `source_report_id` só aponta relatório |
| Registrar ativação/desenho e monitorar | ausente | — |
| Níveis de evidência + negativo permanece | ausente | — |

## Decisões (para o plano)

- Tabela `learnings`: cliente/conta, origem (variantes/relatório),
  hipótese, evidência, limitações, `evidence_level`
  (`hypothesis|consistent_observation|controlled_test`), controle
  (variante, métrica, condições), lote de teste, ativação/desenho,
  resultado (inclusive negativo/inconclusivo).
- Briefing determinístico por template a partir do `recommended_test`
  (sem IA nesta versão — honesto e rastreável); IA entra quando houver
  necessidade validada.
- Monitorar = link p/ performance existente (mesma atribuição), sem motor novo.
- UI: bloco em `/inteligencia` (salvar aprendizado do relatório, ver
  ciclo, registrar ativação/resultado).
