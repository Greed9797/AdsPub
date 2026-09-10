# SPEC-007 — Plano técnico

**Escopo:** gerar, validar, versionar, corrigir, exportar e transformar em
rascunho. Sem auto-veredicto novo (usa 005), sem causalidade prometida.
Migração aditiva.

## Decisões

1. **Geração em 2 tempos.** Serviço monta snapshot determinístico
   (reusa `getPerformance` + `listAnalyses` por asset) e chama a IA com
   tool use forçado (`submit_analysis_report`, prompt `report.v1.md`).
   Validador confere: métricas citadas == snapshot; refs existem no escopo
   e período; mídia citada tem análise; sem métrica → sem performance;
   sem mídia → sem causa; seleção parcial → viés declarado. Falha = 422
   com motivo, relatório não nasce (AC-007-03).
2. **Imutável com cópia.** `analysis_reports`: filtro, `input_snapshot`
   (valores usados), saída validada, versões (modelo/prompt/schema),
   custo, `version`, `supersedes`. `report_feedbacks` à parte.
3. **Teste é rascunho.** `POST /analysis-reports/:id/test-drafts`
   `{briefing}` → lote `manual` em `draft` com briefing + vínculo
   (`test_drafts`? usa `duplicated_from`? Não — lote novo com briefing e
   `notes`? Lotes têm briefing ✓; vínculo relatório→lote em
   `report_test_links`? Mínimo: coluna `source_report_id` no lote? Nova
   coluna anulável em `batches` + rota retorna `batch_id`).
4. **Export on-demand.** `GET .../export?format=html|csv` renderiza do
   imutável. HTML simples, CSV com fatos+linhas.
5. **UI.** Página `/inteligencia`: gerar (conta, período, fonte), ver
   relatório (fatos/hipóteses/testes/limites + evidências), feedback,
   exportar, gerar teste.

## Arquivos reais

- `packages/creative-intel`: prompt `report.v1.md` + `report.ts`
  (montar snapshot + validar saída)
- `packages/db`: `analysis_reports`, `report_feedbacks`, `batches.source_report_id`
- `apps/api`: serviço + rotas; `apps/web`: `/inteligencia`
- Testes: validador puro (nº inventado bloqueia), smoke gerar→feedback→
  export→rascunho, e2e da página.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Nenhuma mutação Meta; recomendação explica variável, métrica e constantes.
