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

## Handoff

- **Feature**: `.specs/features/redesign-v2`
- **Phase / Task**: Specify e Design prontos, Tasks em redação
- **Completed**: none
- **In-progress** (file:line): none
- **Next step**: escrever `tasks.md`, validar, oferecer sub-agentes e executar T1
- **Blockers**: none
- **Uncommitted files**: `.specs/`
- **Branch**: `feat/redesign-v2`
