# STATE

## Decisions

### AD-001
- **Decision**: Remover o Astryx do `apps/web` e escrever primitivos próprios com a mesma API (Button, Table, Dialog, Field, Badge, Card, Empty).
- **Reason**: O Figma do redesign v2 exige pílulas, selos de 13 estados e tabelas que o Astryx não entrega, e a API igual torna a troca de import mecânica.
- **Trade-off**: Manter componentes próprios (foco, teclado, `dialog`) em vez de uma lib mantida por terceiros.
- **Scope**: `apps/web`
- **Date**: 2026-10-03
- **Status**: active

### AD-002
- **Decision**: A UI deriva os estados do quadro de pontos de `Batch.items[].status` e adiciona os grupos "Falhou" e "Conferir" ao desenho do Figma.
- **Reason**: O Figma omitiu `failed` e `needs_reconciliation`, e esconder perdas contradiz a regra "vermelho para perda".
- **Trade-off**: O app tem 11 grupos e o Figma 9.
- **Scope**: `apps/web/src/lib/lotes-view.ts`, rota `/`
- **Date**: 2026-10-03
- **Status**: active

### AD-003
- **Decision**: Um único deploy de produção, depois de todas as rotas migradas e do e2e verde.
- **Reason**: Migrar por partes colocaria duas interfaces no ar ao mesmo tempo.
- **Trade-off**: Nada do redesign chega à produção antes do fim.
- **Scope**: Entrega
- **Date**: 2026-10-03
- **Status**: active

### AD-004
- **Decision**: `GET /batches` passa a devolver `items` e `approval` em cada lote (uma consulta para todos).
- **Reason**: A lista vinha com `items: []`, então o quadro de estados, a barra de pipeline e a fila de publicação não tinham o que contar.
- **Trade-off**: A resposta da lista fica maior (até 200 lotes com seus anúncios).
- **Scope**: `apps/api/src/routes/batches.ts`, `packages/db/src/repos/drafts.ts`
- **Date**: 2026-10-03
- **Status**: active

### AD-005
- **Decision**: `requireRole` chama `forbidden()` (Next `experimental.authInterrupts`) e mostra a página de permissão, em vez de redirecionar para a home.
- **Reason**: O redirect silencioso não explicava o bloqueio (RDS-73).
- **Trade-off**: Depende de uma flag experimental do Next; a resposta HTTP é 200 e não 403.
- **Scope**: `apps/web/src/lib/session.ts`, `apps/web/next.config.ts`, `apps/web/src/app/forbidden.tsx`
- **Date**: 2026-10-03
- **Status**: active

## Handoff

- **Feature**: `.specs/features/redesign-v2`
- **Phase / Task**: T1 a T25 prontas e commitadas; verificação independente em `validation.md` (PASS). Falta só a T26 (deploy).
- **Completed**: T1–T25
- **In-progress** (file:line): none
- **Next step**: o Vitor revisa `test-changes.md` e dá o go-ahead de push, merge e deploy; depois T26 (backup, `deploy-host.sh` prepare/activate, Caddyfile substituído, verificação em produção)
- **Blockers**: go-ahead explícito para push/merge/deploy e as credenciais do deploy (Meta, Anthropic, opencode-auth.json, WhatsApp, domínio e e-mail do admin)
- **Uncommitted files**: none
- **Branch**: `feat/redesign-v2` (local, sem push)
