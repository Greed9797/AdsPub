# SPEC-001 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-001-1 — Revalidar autorização antes de executar (FR-001-06, AC-001-05)

- [x] T-001-1a Teste (worker, fake graph): conexão `needs_attention` após enqueue → `runPublish` recusa antes de qualquer create, item `failed` com erro de autorização, zero POST de escrita.
- [x] T-001-1b Gate local em `publishLocked`: conexão ativa + conta sem `pausedUntil` futuro + conta pertence à conexão; recusa com erro traduzido + auditoria.
- [x] T-001-1c Revalidação remota com janela: `getMe` só se `lastCheckedAt` > 15 min; grava resultado; falha de auth marca `needs_attention` (reusa `handleAuthFailure`).
- [x] T-001-1d Smoke: revogar conexão (status direto no banco) após `markDraftsQueued` → item não publica, nenhum create na Graph falsa.

## T-001-2 — Matriz de capacidades + diagnóstico (FR-001-02, FR-001-03, AC-001-06, AC-001-02)

- [x] T-001-2a `docs/capability-matrix.md`: capacidades × estado × evidência; tudo não-validado exceto o que CI/smoke prova hoje.
- [x] T-001-2b Teste que trava a matriz: toda linha `validada` tem evidência (comando, ambiente, conta, data); campo só-listado-no-SDK nunca `validada`.
- [x] T-001-2c Diagnóstico por conta (rota + serviço): conexão, tier configurado vs observado, última verificação, pausa, capacidades aplicáveis. Só leitura.
- [x] T-001-2d Teste: diagnóstico em conta revogada não publica nada (conta creates na Graph falsa antes/depois).

## T-001-3 — Auth-fail sem loop + rotação (FR-001-05, AC-001-03)

- [x] T-001-3a Teste: token inválido no `runSync` → `needs_attention`, contas pausadas, job termina sem reagendar; segundo sync não gira em loop (tentativas limitadas + pausa).
- [x] T-001-3b Rota admin de rotação de token (usa `rotateConnectionToken`) com re-teste imediato + auditoria; botão em `/contas`.
- [x] T-001-3c Doc: causas separadas (token inválido, revogado, ativo inacessível, quota) × estado × ação do operador.

## Gate final SPEC-001

- [x] Gate frio completo verde + auditoria atualizada com desvios.
