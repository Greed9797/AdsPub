# SPEC-001 — Auditoria: conexões, permissões e diagnóstico

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-000 (não commitado).

## Vereditos (arquivos reais)

| Item | Estado | Evidência |
|---|---|---|
| FR-001-01 credencial/BM/contas/última verificação visíveis | implementado | `services/connections.ts` (test/create/retest), `lastCheckedAt` em `repos/connections.ts:95`, tela `/contas`, `GET /ad-accounts/{id}/health` |
| FR-001-02 permissões mínimas por operação | parcial | 4 scopes hardcoded em `connections.ts:66`; sem matriz operação→escopo |
| FR-001-03 matriz de capacidades por versão | implementado (T-001-2) | `docs/capability-matrix.md` + teste que trava evidência (`scripts/test/capability-matrix.test.ts`) |
| FR-001-04 segredos cifrados, capacidades separadas, RBAC | parcial | cifra + `mask()` + RBAC (`lib/scope.ts`) + testes T030 ok; sync e publish usam o mesmo token, sem separação |
| FR-001-05 revogado/inválido/inacessível/quota separados, pausa seletiva | implementado (T-001-3) | sync pula conexão não-ativa sem loop; rota `POST /connections/:id/rotate` + botão **Trocar token**; causas em `docs/conexoes-operacao.md` |
| FR-001-06 + AC-001-05 revalidar autorização antes de executar | implementado (T-001-1) | gate em `publishLocked` (`pipeline.ts`): conexão ativa + `getMe` se `lastCheckedAt` > 15min; revogado → `AccountAuthError` → `failed` sem create; fase no smoke |
| AC-001-01 isolamento A vs B | implementado | `batchInScope`/`assertAccountAccess` + testes T030 |
| AC-001-02 diagnóstico não publica | implementado | `testToken` só `getMe` + `listOwnedAdAccounts` |
| AC-001-03 token inválido sem loop infinito | implementado (T-001-3) | `needs_attention` + pausa; sync não-ativo retorna zerado sem reagendar; fase no smoke |
| AC-001-04 sem segredo em log/fila/browser/IA | implementado | SC-006, fila só ids (`{draftId, adAccountId, batchId}`) |
| AC-001-06 capacidade "validada" exige evidência | implementado (T-001-2) | matriz + teste; diagnóstico por conta estende `/health` (tier configurado vs observado, verificação, escopos) sem chamar a Meta |

## Risco principal

Revogação entre enqueue e execução não barra nada: janela real de publicação indevida (não de ativação — PAUSED segue valendo).
