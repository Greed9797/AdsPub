# SPEC-008 — Plano técnico

**Escopo:** aprendizado estruturado + briefing por template + ciclo até o
publicador existente. Sem IA gerativa nova, sem fine-tuning, sem vetorial.
Migração aditiva.

## Decisões

1. **Tabela `learnings`.** Origem (relatório + variantes), hipótese,
   evidência/limites (cópia), nível, controle (variante, métrica primária,
   condições), `test_batch_id`, ativação (`activated_at`, desenho),
   resultado (`result_summary`, `outcome`: `positive|negative|inconclusive`).
   Negativo permanece — sem apagar.
2. **Briefing por template.** `buildTestBriefing(report, test)`:
   variável, elementos mantidos, objetivo, métrica, pré-condições +
   hipótese de origem. Determinístico, versionado (`briefing_template v1`).
3. **Fluxo.** `POST /learnings` (do relatório) → `POST
   /learnings/:id/test-briefing` (gera briefing) → `POST .../test-drafts`
   existente com briefing (vincula `test_batch_id`) → aprovação normal
   PAUSED → `PATCH /learnings/:id/activation` (humano informa ativação) →
   `PATCH .../result` (humano informa resultado; monitora via performance).
4. **Nível sobe só com registro.** `hypothesis` → `consistent_observation`
   (humano anexa evidência) → `controlled_test` (lote publicado + resultado).
   Promoção automática, nunca.

## Arquivos reais

- `packages/db`: `learnings` + repo; `packages/creative-intel`? Não —
  template no serviço da API (`services/learnings.ts`, puro o bastante).
- Rotas em `routes/learnings.ts`; bloco na `/inteligencia`.
- Testes: template determinístico (unit), ciclo smoke (salvar→briefing→
  rascunho→ativação→resultado negativo permanece), e2e estende jornada 8.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Orçamento/público sempre humano; biblioteca entre marcas sem
compartilhamento explícito, nunca.
