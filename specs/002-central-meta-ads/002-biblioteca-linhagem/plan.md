# SPEC-002 — Plano técnico

**Escopo:** identidade de variante + vínculo observado. Sem motor de
métricas, sem IA, sem reescrever biblioteca. Migrações aditivas.

## Decisões

1. **Variante = fingerprint de composição, imutável.** Tabela
   `creative_variants` (cliente, fingerprint unique, manifesto jsonb:
   assets ordenados, copy, headline, descrição, CTA, link, url_tags,
   contexto de oferta). `validateBatch` deriva e grava `variant_id` no item
   (get-or-create; mesmo conteúdo = mesma variante, AC-002-02). Nome nunca
   entra no fingerprint (AC-002-03).
2. **Vínculo com janela observada.** `ad_creative_bindings` (item, conta,
   `meta_ad_id`, `meta_creative_id`, variante, `observed_from/to`,
   `precision`: `confirmed|manual|ambiguous_intraday|media_missing`,
   motivo). Publish cria `confirmed`; um vínculo ativo por item
   (`observed_to` nulo).
3. **Poller observa, não inventa.** `status-poll` compara `creative_id`
   observado com o vínculo ativo: mudou → fecha antigo, abre novo
   `ambiguous_intraday` com motivo; métrica nenhuma é dividida (não existe
   motor ainda — AC-002-04 vale por construção e fica travado em teste).
   Assets da variante ausentes → `media_missing`, sem descrever nada
   (AC-002-06).
4. **Manual para histórico (FR-002-04).** `POST
   /ad-accounts/:id/bindings` (admin/coordinator): `meta_ad_id`,
   `meta_creative_id`, `variant_id` → vínculo `manual`. É a resolução para
   nomes repetidos e mídia fora do app (AC-002-03).
5. **Biblioteca exibe, não duplica.** `GET /variants?client_id&format&q` +
   seção na página `/criativos` (tabela simples, filtros existentes).
   Família explícita fica para SPEC-006 (agrupamento semântico); aqui só
   identidade exata.

## Arquivos reais tocados

- `packages/db/src/schema.ts` + migração (2 tabelas, 1 coluna `variant_id`)
- `packages/db/src/repos/variants.ts` + `bindings.ts` (novo)
- `apps/api/src/services/validation.ts` (deriva variante) e `approval.ts`
  (fingerprint da variante entra no fingerprint do lote? Não — lote cobre
  conteúdo; variante é derivada do mesmo conteúdo, redundante. Fora.)
- `apps/worker/src/publish/pipeline.ts` (cria vínculo `confirmed` no done)
- `apps/worker/src/poll/status.ts` (detecta troca → ambíguo)
- Rotas: `GET /variants`, `POST /ad-accounts/:id/bindings`; UI `/criativos`
- Testes: variante (unidade), vínculo no publish (smoke), troca intradiária
  (unit do poller com fake), manual (smoke/route)

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Nenhum ACTIVE, nenhuma chamada Meta nova além das existentes.
