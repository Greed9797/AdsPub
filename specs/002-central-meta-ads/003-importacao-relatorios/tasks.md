# SPEC-003 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-003-1 — Parser determinístico (FR-003-01, FR-003-05)

- [x] T-003-1a Pacote `packages/reports`: CSV próprio (sniff `;`/`,`, aspas, utf-8→latin1) + XLSX via `xlsx` (1ª aba ou `?sheet=`); limites 10 MB / 20k linhas; teste PT (`;`, `1.234,56`, `31/12/2026`) e EN.
- [x] T-003-1b Dicionário PT/EN versionado (`mapping_version v1`) + números (símbolo fora, milhar BR) + datas (DD/MM e ISO); teste: irreconhecível = coluna `unmapped`, nunca chute (AC-003-01).
- [x] T-003-1c Linhas de total excluídas com motivo; célula vazia = ausente; consolidado = 1 observação `period` (AC-003-03); teste.

## T-003-2 — Staging e commit (FR-003-02, FR-003-03, FR-003-04, FR-003-06)

- [x] T-003-2a Schema + migração: `report_imports`, `report_rows`, `metric_observations` (chave §3 do contrato).
- [x] T-003-2b Rotas upload/mapping-preview/commit; contexto obrigatório (cliente, moeda, tz, período, nível, atribuição|desconhecida, cobertura); teste: sem compras = sem CPA/ROAS (AC-003-02).
- [x] T-003-2c Identidade: `ad_id` exato ou `local_row_id` estável; notação científica nunca vincula (AC-003-06); teste.
- [x] T-003-2d Recommit mesmo sha+mapping = 409 sem duplicar (AC-003-04); mapping diferente = nova revisão, fatos preservados.
- [x] T-003-2e Smoke ponta a ponta com CSV real + mídia vinculada quando `ad_id` bate com vínculo (AC-003-07).

## T-003-3 — UI mínima (FR-003-01)

- [x] T-003-3a Página `/relatorios`: upload, prévia com erros por linha, commit; teste e2e da jornada.

## Gate final SPEC-003

- [x] Gate frio completo verde + auditoria atualizada com desvios.
