# SPEC-003 — Plano técnico

**Escopo:** upload → staging → mapeamento → commit → observações. Sem IA
(sugestão de mapeamento fica p/ SPEC-006), sem dashboard (SPEC-005), sem
sync (SPEC-004). Migrações aditivas. Uma dep nova: `xlsx` (leitura).

## Decisões

1. **Três tabelas.** `report_imports` (arquivo privado + contexto + mapping +
   status), `report_rows` (staging: raw, mapped, status, erros) e
   `metric_observations` (canônicas, imutáveis após commit).
2. **Rotas.** `POST /report-imports` (multipart: arquivo + contexto) devolve
   `import_id` + proposta de mapeamento; `PATCH /report-imports/:id/mapping`
   (ajuste manual) devolve prévia linha a linha; `POST
   /report-imports/:id/commit` grava observações (idempotente por revisão:
   mesmo sha+mapping = 409). Erros RFC9457 com linha/campo, sem segredo.
3. **Regras duras do parser.** Total misturado (`Total`, id vazio + nome
   total) vira linha `invalid` com motivo, nunca observação. Célula vazia =
   ausente, nunca zero. Consolidado vira 1 observação `period`, nunca N
   diárias. ID em notação científica/arredondado não vincula (`ad_id` só
   quando dígito exato; senão `local_row_id` + revisão).
4. **UI mínima.** Página `/relatorios`: upload, tabela de prévia com erros
   por linha, confirmar. Reusa `Card/Table/Field` existentes.
5. **Sem misturar fontes.** Observação carrega `source: 'file'` + snapshot;
   API terá `source: 'api'` (SPEC-004). Seleção de fonte fica p/ SPEC-005.

## Arquivos reais (novos salvo indicação)

- `packages/reports/*` (novo pacote: csv, xlsx, mapping, observation) ou
  `packages/rules/`? Novo pacote `packages/reports` — domínio próprio,
  reuso por SPEC-004/005. Registra no workspace + turbo.
- `packages/db/src/schema.ts` + migração; `repos/report-imports.ts`
- `apps/api/src/routes/report-imports.ts`; `apps/web/src/app/relatorios/`
- Testes: parser (PT/EN, decimal BR, totais, sem-ID, reimport 409),
  smoke ponta a ponta com CSV real.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Arquivo malformado nunca vira análise válida: falha com motivo por linha.
