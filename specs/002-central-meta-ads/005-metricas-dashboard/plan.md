# SPEC-005 — Plano técnico

**Escopo:** motor + `GET /performance` + página `/performance`. Sem IA,
sem relatório salvo (007), sem comparador arquivo×API além de filtro de
fonte. Migração aditiva (1 coluna).

## Decisões

1. **Motor puro em `@adpub/analytics`.** Entrada: observações + política.
   Saída: `{ totals, rows[], warnings[], definitions, sources }`.
   Fórmulas §5 com `metric_version v1`; denominador zero = indisponível com
   motivo; média de taxa nunca (soma numerador/denominador).
2. **Coorte ou limitação.** Grupo = conta + evento + moeda? Moeda não existe
   nas observações — contexto tem `currency` no import… observações não
   guardam moeda! Adicionar `currency` às observações? É aditivo e necessário
   p/ não misturar moedas (AC-005-05). Sim: coluna `currency` default
   `'unknown'`; file preenche do contexto; api preenche da conta
   (`adAccounts.currency`). Grupo incompatível (moeda/atribuição/evento
   distintos) → sem ranking, só linhas + limitação explícita.
3. **Veredicto só com política.** `clients.metric_policy`: `{version,
   min_spend, min_results, min_days, maturity_days}`. Incompleta → ranking
   descritivo ordenado + `sufficiency: 'unevaluated'`. Completa + thresholds
   → `winner` por grupo com critério registrado.
4. **Alcance não soma.** Sem coluna de alcance nas fontes: qualquer pedido
   que exija agregado de únicos responde `unavailable: 'sem recorte de
   alcance'`. Quando a fonte trouxer, entra por consulta compatível.
5. **API + UI.** `GET /performance?ad_account_id&from&to&source?&level?`
   (escopo existente). Página com filtros, tabela por anúncio, origem/
   snapshot/definições visíveis, drill por período? Não — drill = trocar
   nível/fonte. Suficiente p/ MVP.

## Arquivos reais

- `packages/analytics/*` + testes puros; `packages/db` coluna
  `metric_observations.currency` + `clients.metric_policy`
- `apps/api/src/services/performance.ts` + rota; `apps/web/src/app/performance/`
- Smoke: CSV com 2 moedas? Moeda é por import… 2 imports mesma conta moedas
  distintas → limitação, sem placar. Teste motor cobre o resto.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Nenhum número sem denominador; nenhum ranking sem volume.
