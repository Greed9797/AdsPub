# SPEC-007 — Auditoria: inteligência e relatórios

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-006 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| Snapshot determinístico + conteúdo versionado | implementado | SPEC-005/006 (performance service, content_analyses) |
| Relatório imutável fato/hipótese/teste/limite | ausente | — |
| Validação de evidências (nº = snapshot, ref existe) | ausente | — |
| Correção humana versionada | ausente | — |
| Export HTML/CSV | ausente | — |
| Rascunho de teste sem efeito Meta | parcial | duplicação manual existe; sem vínculo relatório→rascunho |

## Decisões (para o plano)

- Tabela `analysis_reports` com **cópia dos valores usados**
  (`input_snapshot`): relatório antigo reproduzível mesmo após revisão de
  conversões (AC-007-06). Imutável; dado novo = nova versão (`supersedes`).
- IA recebe snapshot + análises e devolve schema travado; servidor valida
  cada número contra o snapshot e cada ref (AC-007-03). Sem métricas = sem
  afirmação de performance (AC-007-01); sem mídia = sem causa de cena
  (AC-007-02); só-vencedores = viés declarado (AC-007-04).
- `report_feedbacks` separado (relatório segue imutável).
- `POST .../test-drafts` cria lote `draft` com briefing (SPEC-008 continua).
- Export HTML (template simples) + CSV na emissão, guardados? Gerados
  on-demand do imutável — sem duplicar dado.
