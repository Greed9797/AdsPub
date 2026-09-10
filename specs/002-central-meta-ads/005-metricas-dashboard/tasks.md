# SPEC-005 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-005-1 — Motor (FR-005-01, FR-005-02, FR-005-06)

- [x] T-005-1a Pacote `@adpub/analytics`: totais por soma de numeradores (ROAS/CPA/CTR/CPC/CPM), zero→indisponível, cliques separados, `metric_version v1`; teste (AC-005-01/02).
- [x] T-005-1b Ausente ≠ zero em API/banco/UI; alcance agregado sem recorte = indisponível (AC-005-03/04); teste.

## T-005-2 — Grupos e veredicto (FR-005-04, FR-005-05)

- [x] T-005-2a Coorte (conta, moeda, atribuição, evento): incompatível = sem ranking + limitação (AC-005-05/06); teste.
- [x] T-005-2b Política no cliente + veredicto com critério; sem política = `unevaluated`; teste.
- [x] T-005-2c Coluna `currency` nas observações (file: contexto; api: conta) + `metric_policy` no cliente; migração.

## T-005-3 — API e UI (FR-005-03, FR-005-07)

- [x] T-005-3a `GET /performance` com origem/snapshot/definições; teste via smoke.
- [x] T-005-3b Página `/performance` + link no nav; e2e filtra e vê números rastreáveis (AC-005-07).

## Gate final SPEC-005

- [x] Gate frio completo verde + auditoria atualizada com desvios.
