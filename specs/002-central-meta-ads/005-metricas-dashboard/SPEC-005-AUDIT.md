# SPEC-005 — Auditoria: motor de métricas e dashboard

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-004 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| Fórmulas versionadas sobre fonte/coorte coerente | ausente | observações existem (`file`+`api`); cálculo nenhum |
| Separar cliques totais/link/saída; evento primário + receita | ausente | colunas existem, sem motor |
| Dashboard cliente/conta/período + drill-down + fonte | ausente | só `/saude` operacional |
| Rankings descritivos; veredicto só com política | ausente | — |
| Grupos compatíveis ou limitações explícitas | ausente | — |
| Não-aditivas (alcance) com recorte próprio | ausente | sem dado de alcance em nenhuma fonte |
| Cache invalidado por dado novo | n/a | sem camada de cache — nada para invalidar |

## Decisões (para o plano)

- Pacote novo `@adpub/analytics`: `metrics.ts` (fórmulas §5, definem
  `metric_version: "v1"`), `groups.ts` (coorte compatível ou limitação),
  `verdict.ts` (política de suficiência). Puro, sem DB — teste sem banco.
- Política de suficiência no cliente (`clients.metric_policy` jsonb,
  versionada): sem política completa → ranking descritivo +
  "suficiência não avaliada".
- API `GET /performance` (conta, período, fonte, nível): métricas, volume,
  origem/snapshot/definições, limitações. Alcance agregado sem recorte
  próprio = indisponível com motivo (regra, não soma).
- UI `/performance`: filtros, drill-down conta→campanha? Drill-down exige
  nível campanha/conjunto — observações têm `entity_level`; MVP: drill por
  anúncio + grupo conta/período. Campanha/conjunto entram se houver dados.
- Cache: documentado como inexistente; relatório (007) copia valores.
