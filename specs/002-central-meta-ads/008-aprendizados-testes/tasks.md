# SPEC-008 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-008-1 — Aprendizado e briefing (FR-008-01, FR-008-02)

- [x] T-008-1a Schema + migração: `learnings`.
- [x] T-008-1b Template determinístico de briefing (unit) + `POST /learnings` do relatório.
- [x] T-008-1c `POST /learnings/:id/test-briefing` devolve briefing; sem Meta (AC-008-01).

## T-008-2 — Ciclo e evidência (FR-008-03..06)

- [x] T-008-2a `POST /learnings/:id/test-drafts` (reusa lote draft + vínculo); aprovado segue PAUSED (AC-008-02/03).
- [x] T-008-2b Ativação/resultado manuais + níveis de evidência; negativo permanece (AC-008-04/05/06).
- [x] T-008-2c Smoke do ciclo + e2e estende jornada 8 (AC-008-01..06).

## Gate final SPEC-008

- [x] Gate frio completo verde + auditoria atualizada com desvios.
