# Redesign v2 do AdPub Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/redesign-v2/design.md`
**Status**: Approved

---

## Test Coverage Matrix

| Code layer | Required test type | Coverage expectation |
| ---------- | ------------------ | -------------------- |
| Tokens e CSS (`src/styles/*.css`) | unit | Os valores hexadecimais do Figma presentes em `tokens.css` (RDS-01) |
| Visão de lotes (`src/lib/lotes-view.ts`) | unit | Asserções 1:1 com os critérios RDS-10, 11, 13, 14; cada caso de borda tem teste |
| Primitivos de UI (`src/components/ui/*`) | unit | `renderToStaticMarkup` confere papéis, `aria` e classes de cada variante |
| Casca (`src/components/shell/*`, `layout.tsx`) | e2e | Abas, menus por papel, tema, mobile, sem erro com API de contas falhando |
| Rotas (`src/app/**/page.tsx`) | e2e | Caminho feliz, cada borda e cada erro listados no critério da tarefa |
| Server actions e `lib/api.ts` | none | Não mudam; o e2e existente continua cobrindo |
| Dependências e configuração | none | Gate de build |

## Gate Check Commands

Pré-requisito do e2e: Colima e o compose de infra no ar (Postgres 55432, Redis 56379, MinIO 59000).

| Level | Command | When |
| ----- | ------- | ---- |
| quick | `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web` | Tarefas só com teste unitário |
| full | `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e <spec da tarefa>` | Tarefas com e2e |
| build | `pnpm build && pnpm lint && pnpm typecheck && pnpm test` | Sem testes, ou última tarefa da fase (mais `pnpm test:e2e`) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Fluxo principal

```
T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: Telas de apoio

```
T12 → T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20 → T21 → T22
```

### Phase 4: Fechamento

```
T22 → T23 → T24 → T25 → T26
```

---

## Task Breakdown

### T1: Tokens, fontes e CSS base

**Status**: ✅ Complete
**What**: Criar `tokens.css` (claro e escuro derivado) e `base.css`, empacotar Nunito e mover o CSS atual para `legacy.css` em camada.
**Where**: `apps/web/src/styles/tokens.css`, `apps/web/src/styles/base.css`, `apps/web/src/app/globals.css`, `apps/web/package.json`
**Depends on**: None
**Reuses**: `geist` (já no repo), variáveis do Figma `App / Cor (W3 claro)` e `App / Medida`
**Requirement**: RDS-01, RDS-02, RDS-03, RDS-09

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] `tokens.css` define as 20 cores, os raios (6, 12, 16, 24, 28, 999) e os estilos de texto do Figma
- [x] Nunito vem de `@fontsource-variable/nunito` e Geist de `geist`, sem `next/font/google`
- [x] O foco visível usa borda de tinta e anel laranja de 3 px a 35%
- [x] O CSS antigo continua carregando em `@layer legacy`
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add redesign tokens, fonts and base css`

---

### T2: Modelo de visão de lotes

**Status**: ✅ Complete
**What**: Funções puras que agrupam anúncios em 11 estados, contam atenção, calculam segmentos de pipeline e a fila de publicação.
**Where**: `apps/web/src/lib/lotes-view.ts`
**Depends on**: T1
**Reuses**: `AdDraftStatus` e `Batch` de `apps/web/src/lib/types.ts` (import relativo)
**Requirement**: RDS-10, RDS-11, RDS-13, RDS-14

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Cada um dos 15 `AdDraftStatus` mapeia para o grupo definido no design
- [x] `precisamAtencao` soma bloqueado, reprovado, falhou e conferir
- [x] `segmentosDoLote` devolve contagens por grupo e vazio para lote sem anúncios, sem divisão por zero
- [x] `filaDePublicacao` devolve só lotes `ready` com `approval.approved` verdadeiro
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web`
- [x] Test count: 27 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add batch view model for state groups and pipeline`

---

### T3: Primitivos de UI

**Status**: ✅ Complete
**What**: Criar `components/ui/` com Button, ButtonLink, Selo, Table, Dialog, Field, Input, Select, Textarea, Checkbox, Chip, Callout, Card e Empty, com a API do Astryx usada hoje.
**Where**: `apps/web/src/components/ui/`, `apps/web/src/lib/labels.ts`
**Depends on**: T2
**Reuses**: assinaturas de `apps/web/src/components/ui.tsx`
**Requirement**: RDS-09

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] Button aceita `variant`, `label`, `isDisabled`, `onClick`, `type`, `href`, `as`
- [x] Selo renderiza as 13 variantes com texto e papel acessível
- [x] Dialog usa `<dialog>` com `role="dialog"` e fecha com Esc
- [x] Field associa `label` e `aria-describedby` ao controle
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web`
- [x] Test count: 28 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): add own ui primitives matching the astryx api`

---

### T4: Casca desktop

**Status**: ✅ Complete
**What**: Barra superior com 5 abas e menus por papel, busca, sincronização e Sair; rodapé com o seletor de tema. O provedor com `Theme` do Astryx fica até o T23.
**Where**: `apps/web/src/components/shell/`, `apps/web/src/lib/nav.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/providers.tsx`
**Depends on**: T3
**Reuses**: `visibleNav()` atual, cookie `adpub_theme`
**Requirement**: RDS-04, RDS-05, RDS-07, RDS-08

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] As abas Lotes, Criativos, Performance, Contas e Gestão aparecem em toda rota autenticada
- [x] Contas e Gestão abrem menus filtrados por papel e flag
- [x] Escolher Claro, Escuro ou Sistema grava o cookie e aplica `data-theme`
- [x] Com `GET /ad-accounts` falhando a página renderiza sem o rótulo de sincronização
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-shell.spec.ts`
- [x] Test count: 39 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): add top bar shell with role-aware menus and theme`

---

### T5: Casca mobile

**Status**: ✅ Complete
**What**: Barra inferior, topo compacto e a rota `/mais` com os demais destinos e a aparência.
**Where**: `apps/web/src/components/shell/bottom-nav.tsx`, `apps/web/src/app/mais/page.tsx`
**Depends on**: T4
**Reuses**: `lib/nav.ts`
**Requirement**: RDS-06

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] Em 390 px a barra inferior mostra Lotes, Criativos, Performance, Contas e Mais
- [x] `/mais` lista Inteligência, Relatórios, Clientes, Saúde, Auditoria, Usuários e WhatsApp conforme o papel
- [x] A casca e `/mais` não rolam na horizontal em 390 px (as demais rotas entram com T6 a T22 e fecham em T25)
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-shell-mobile.spec.ts`
- [x] Test count: 8 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(web): add mobile bottom navigation and more page`

---

### T6: Lotes (lista desktop)

**Status**: ✅ Complete
**What**: Rota `/` com quadro de pontos, filtros "Mostrar na lista", tabela com barra de pipeline e fila de publicação.
**Where**: `apps/web/src/app/page.tsx`, `apps/web/src/components/lotes/{state-board,pipeline-bar}.tsx`, `apps/web/src/styles/lotes.css`; `GET /batches` passa a devolver `items` e `approval` (a lista vinha com `items: []`)
**Depends on**: T5
**Reuses**: `lib/lotes-view.ts`, filtros de URL existentes
**Requirement**: RDS-10, RDS-11, RDS-12, RDS-13, RDS-14

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] O quadro mostra 1 ponto por anúncio nos 11 grupos
- [x] Acionar um grupo filtra a lista por URL e mantém conta e busca
- [x] Cada linha mostra a barra de pipeline com largura proporcional
- [x] A fila de publicação aparece só com lote `ready` aprovado
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-lotes.spec.ts`
- [x] Test count: 8 e2e + 2 unit new (suíte e2e 32, vitest 493) pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign batches list with state board and pipeline bars`

---

### T7: Lotes (cartões mobile e vazio)

**Status**: ✅ Complete
**What**: Cartões de lote até 768 px e o estado vazio com "Novo lote" só para quem edita.
**Where**: `apps/web/src/app/page.tsx`, `components/lotes/state-board.tsx`, `styles/lotes.css`
**Depends on**: T6
**Reuses**: `ui/Empty`
**Requirement**: RDS-15, RDS-16

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] Em 390 px a lista vira cartões com a mesma informação
- [x] Sem lotes aparece o vazio, com "Novo lote" apenas se o papel não é `viewer`
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-lotes-mobile.spec.ts`
- [x] Test count: 4 e2e pass (suíte e2e 36) (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): add mobile batch cards and empty state`

---

### T8: Lote aberto (lista e estrutura)

**Status**: ✅ Complete
**What**: Lista de anúncios com miniatura, etapas na Meta e selo, e o cartão de estrutura compartilhada.
**Where**: `apps/web/src/app/lotes/[id]/page.tsx`, `apps/web/src/app/lotes/[id]/batch-items-table.tsx`
**Depends on**: T7
**Reuses**: `batch-items-table.tsx` atual
**Requirement**: RDS-20, RDS-27

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] Cada anúncio mostra 5 segmentos de etapa e o selo de estado
- [x] A estrutura lista campanha e conjuntos com o estado de cada ref
- [x] Com papel `viewer` nenhuma ação de edição ou publicação aparece
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-lote.spec.ts`
- [x] Test count: 4 e2e + 12 unit new (suíte e2e 40, vitest 505) pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign open batch list and shared structure`

---

### T9: Ficha do anúncio

**Status**: ✅ Complete
**What**: Ficha lateral com prévia, textos editáveis, checklist de validação e dados de campanha e conjunto.
**Where**: `apps/web/src/app/lotes/[id]/item-editor.tsx`, `apps/web/src/components/ad-preview.tsx`
**Depends on**: T8
**Reuses**: `item-editor.tsx` e `ad-preview.tsx` atuais, action de salvar item
**Requirement**: RDS-21, RDS-22, RDS-28

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] Abrir um anúncio mostra a ficha sem sair da lista
- [x] Salvar avisa que a aprovação do lote caiu
- [x] Cada erro de validação lista o item e o que corrigir
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-ficha.spec.ts`
- [x] Test count: 4 e2e new (suíte e2e 44, vitest 505) pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign ad sheet with preview and validation checklist`

---

### T10: Revisão final, andamento e conferência

**Status**: ✅ Complete
**What**: Janela de revisão final com aviso de pausa e saldo diário, andamento por lote e painel de conferência.
**Where**: `apps/web/src/app/lotes/[id]/publish-panel.tsx`, `apps/web/src/app/lotes/[id]/reconciliation-panel.tsx`
**Depends on**: T9
**Reuses**: `publish-panel.tsx`, `reconciliation-panel.tsx`, `progress-stream.tsx`
**Requirement**: RDS-23, RDS-24, RDS-25, RDS-26

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] A revisão mostra lotes, conta, anúncios, orçamento, saldo diário e o aviso "pausados"
- [x] Acima do saldo avisa quantos não entram hoje e oferece publicar só o que cabe
- [x] O andamento aparece por lote e continua fora da janela
- [x] Item em `needs_reconciliation` mostra a conferência e nunca recria sozinho
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-publicar.spec.ts`
- [x] Test count: 5 e2e + 4 unit new (suíte e2e 49, vitest 509) pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign final review, progress and reconciliation`

---

### T11: Novo lote

**Status**: ✅ Complete
**What**: Etapas, cartões de modo, mídias em grade, resumo com aviso de limite e barra de ação.
**Where**: `apps/web/src/app/lotes/novo/new-batch-form.tsx`, `apps/web/src/app/lotes/novo/page.tsx`
**Depends on**: T10
**Reuses**: `new-batch-form.tsx`, `lotes/actions.ts`
**Requirement**: RDS-30, RDS-31, RDS-32, RDS-33, RDS-34

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [x] O modo IA e o manual são cartões selecionáveis e enviam o mesmo valor de hoje
- [x] O resumo avisa quando mídias × variações excede o saldo diário
- [x] Erro de validação mantém os dados digitados e mostra a mensagem no campo
- [x] O botão fica desabilitado enquanto o lote é criado
- [x] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-novo-lote.spec.ts`
- [x] Test count: 5 e2e new (suíte e2e 54, vitest 509) pass; 2 linhas de teste existente alteradas (test-changes.md) (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign new batch form with mode cards and summary`

---

### T12: Acesso

**What**: Login e primeiro acesso com abas, no layout do Figma.
**Where**: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/login-form.tsx`, `apps/web/src/app/login/bootstrap-form.tsx`
**Depends on**: T11
**Reuses**: `login/actions.ts`
**Requirement**: RDS-40, RDS-41, RDS-42

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] `/login` mostra as abas Entrar e Primeiro acesso
- [ ] Login inválido mostra a mensagem no formulário e mantém os campos
- [ ] Sem bootstrap disponível a aba Primeiro acesso não aparece
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-acesso.spec.ts`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(web): redesign login and first access`

---

### T13: Criativos

**What**: Quadro de validação, filtros, grade de mídias com selo e barra de seleção.
**Where**: `apps/web/src/app/criativos/page.tsx`, `apps/web/src/app/criativos/upload-form.tsx`, `apps/web/src/app/criativos/drive-import-form.tsx`
**Depends on**: T12
**Reuses**: `criativos/actions.ts`, `analysis-button.tsx`
**Requirement**: RDS-50, RDS-59

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] A grade mostra selo de estado e o motivo quando a mídia é recusada
- [ ] Upload e importação do Drive continuam funcionando
- [ ] Valor sem dado na API é omitido, nunca inventado
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-criativos.spec.ts`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign media library`

---

### T14: Contas Meta

**What**: Conexões, tabela de contas e ficha de padrões da conta.
**Where**: `apps/web/src/app/contas/page.tsx`, `apps/web/src/app/contas/connection-form.tsx`, `apps/web/src/app/contas/account-defaults-form.tsx`
**Depends on**: T13
**Reuses**: `contas/actions.ts`
**Requirement**: RDS-51

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] Criar, testar, sincronizar e trocar token continuam disponíveis
- [ ] A ficha edita os padrões da conta e salva
- [ ] O token nunca volta para a tela
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-contas.spec.ts`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign meta connections and accounts`

---

### T15: Clientes

**What**: Tabela de clientes e ficha com criar e editar.
**Where**: `apps/web/src/app/clientes/page.tsx`, `apps/web/src/app/clientes/client-form.tsx`
**Depends on**: T14
**Reuses**: `clientes/actions.ts`
**Requirement**: RDS-52

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] A tabela lista os clientes e a ficha abre ao escolher um
- [ ] Criar e editar cliente funcionam
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-clientes.spec.ts`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign clients`

---

### T16: Saúde das contas

**What**: Resumo, tabela por conta com teto diário e limite da Meta, e alerta da conta em atenção.
**Where**: `apps/web/src/app/saude/page.tsx`
**Depends on**: T15
**Reuses**: dados atuais da rota
**Requirement**: RDS-53, RDS-59

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] O resumo e a tabela usam só campos que a API devolve
- [ ] Conta em atenção sobe para o topo com o alerta
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-saude.spec.ts`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign account health`

---

### T17: WhatsApp

**What**: Números, modelos e envio de teste, com conectar e criar modelo.
**Where**: `apps/web/src/app/whatsapp/page.tsx`, `apps/web/src/app/whatsapp/connect-form.tsx`, `apps/web/src/app/whatsapp/send-form.tsx`, `apps/web/src/app/whatsapp/template-form.tsx`
**Depends on**: T16
**Reuses**: `whatsapp/actions.ts`
**Requirement**: RDS-54

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] Conectar número, criar modelo e enviar teste continuam funcionando
- [ ] O token nunca volta para a tela
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-whatsapp.spec.ts`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign whatsapp`

---

### T18: Performance

**What**: Filtros, KPIs, gasto por dia, custo por resultado e tabela, com período e origem visíveis.
**Where**: `apps/web/src/app/performance/page.tsx`
**Depends on**: T17
**Reuses**: dados atuais da rota
**Requirement**: RDS-55, RDS-59

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] Período e origem dos dados aparecem sempre
- [ ] Os KPIs batem com os totais da tabela
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-performance.spec.ts`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign performance`

---

### T19: Inteligência e Relatórios

**What**: Relatório de hipóteses e revisão de importação com mapeamento e observações.
**Where**: `apps/web/src/app/inteligencia/page.tsx`, `apps/web/src/app/inteligencia/inteligencia-form.tsx`, `apps/web/src/app/relatorios/page.tsx`, `apps/web/src/app/relatorios/relatorio-form.tsx`
**Depends on**: T18
**Reuses**: `inteligencia/actions.ts`, `relatorios/actions.ts`
**Requirement**: RDS-56

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] Gerar relatório, importar arquivo e confirmar observações continuam funcionando
- [ ] A importação mostra o mapeamento e exige confirmar antes de valer
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-analise.spec.ts`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign intelligence and reports`

---

### T20: Auditoria

**What**: Filtros e tabela com "Ver alterações" expansível por evento.
**Where**: `apps/web/src/app/auditoria/page.tsx`
**Depends on**: T19
**Reuses**: dados atuais da rota
**Requirement**: RDS-57

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] Cada evento expande o antes e o depois
- [ ] Os filtros atuais continuam funcionando
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-auditoria.spec.ts`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign audit log`

---

### T21: Usuários

**What**: Tabela, ficha com papel, contas e senha, e a explicação do papel.
**Where**: `apps/web/src/app/usuarios/page.tsx`, `apps/web/src/app/usuarios/user-create-form.tsx`, `apps/web/src/app/usuarios/user-row-form.tsx`
**Depends on**: T20
**Reuses**: `usuarios/actions.ts`
**Requirement**: RDS-58

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] Criar usuário, trocar papel e contas, desativar e redefinir senha continuam funcionando
- [ ] A ficha explica o que o papel escolhido pode e não pode
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-usuarios.spec.ts`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: full

**Commit**: `feat(web): redesign users`

---

### T22: Estados de erro, vazio, carregando e permissão

**What**: `error.tsx`, `not-found.tsx`, esqueleto de carregamento e página de permissão.
**Where**: `apps/web/src/app/error.tsx`, `apps/web/src/app/not-found.tsx`, `apps/web/src/app/loading.tsx`, `apps/web/src/components/forbidden.tsx`
**Depends on**: T21
**Reuses**: `ui/Callout`, `ui/Empty`
**Requirement**: RDS-70, RDS-71, RDS-72, RDS-73

**Tools**:

- MCP: `filesystem`
- Skill: `impeccable`

**Done when**:

- [ ] API fora do ar mostra o erro com código de requisição e "Tentar de novo"
- [ ] Rota inexistente mostra não encontrado com o caminho de volta
- [ ] A rota carregando mostra o esqueleto da lista
- [ ] Papel `viewer` em rota restrita mostra o motivo
- [ ] Gate check passes: `pnpm --filter @adpub/web typecheck && pnpm exec vitest run apps/web && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-estados.spec.ts`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(web): add error, empty, loading and forbidden states`

---

### T23: Remover o Astryx e o CSS legado

**What**: Trocar os imports restantes pelos primitivos próprios, apagar `legacy.css`, `astryx-theme.ts` e a dependência.
**Where**: `apps/web/src/`, `apps/web/package.json`, `apps/web/src/app/globals.css`
**Depends on**: T22
**Reuses**: `components/ui/`
**Requirement**: RDS-01

**Tools**:

- MCP: `filesystem`
- Skill: `dead-code-killer`

**Done when**:

- [ ] `grep -r "@astryxdesign" apps/web` não retorna nada
- [ ] `legacy.css` e `astryx-theme.ts` não existem
- [ ] Gate check passes: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`
- [ ] Test count: all existing tests pass (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `refactor(web): remove astryx and legacy css`

---

### T24: Atualizar o e2e e passar a suíte inteira

**What**: Ajustar os rótulos que o Figma muda de propósito e rodar as 16 jornadas mais as novas.
**Where**: `e2e/*.spec.ts`
**Depends on**: T23
**Reuses**: `e2e/fixtures.ts`
**Requirement**: RDS-20

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [ ] Só mudam testes cujo texto o Figma troca por decisão, cada um anotado no commit
- [ ] As 16 jornadas e as novas passam
- [ ] Gate check passes: `pnpm build && pnpm lint && pnpm typecheck && pnpm test && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e`
- [ ] Test count: nenhum teste removido nem pulado

**Tests**: e2e
**Gate**: build

**Commit**: `test(e2e): align journeys with redesigned copy`

---

### T25: Verificação visual e contraste

**What**: Capturar as 14 rotas e o login em 1440 e 390 px, claro e escuro, comparar com o Figma e corrigir cortes e contraste.
**Where**: `e2e/redesign-visual.spec.ts`, ajustes em `apps/web/src/styles/`
**Depends on**: T24
**Reuses**: harness do e2e, `visual-check`
**Requirement**: RDS-91

**Tools**:

- MCP: `figma`
- Skill: `impeccable`

**Done when**:

- [ ] Nenhuma rota rola na horizontal em 390 px
- [ ] Texto com contraste de pelo menos 4,5:1 em claro e em escuro
- [ ] Nenhum texto cortado nas capturas de 1440 e 390 px
- [ ] Gate check passes: `pnpm build && pnpm lint && pnpm typecheck && pnpm test && E2E_API_PORT=4510 E2E_WEB_PORT=3510 pnpm test:e2e e2e/redesign-visual.spec.ts`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `fix(web): resolve visual and contrast findings`

---

### T26: Deploy em produção

**What**: Subir o novo front no `w3vps` com migrações 0012 a 0021, backup antes e verificação depois. Exige go-ahead explícito no momento.
**Where**: `infra/deploy-host.sh` (sem alterar), host `w3vps`
**Depends on**: T25
**Reuses**: `infra/deploy-host.sh`, `infra/backup.sh`, `docs/deploy.md`
**Requirement**: RDS-90

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Backup do Postgres e do MinIO comprovado antes do `activate`
- [ ] `https://adpub.179-198-104-210.sslip.io/login` responde 200
- [ ] `/api/v1/health` responde `ok` e `drizzle.__drizzle_migrations` tem 22 linhas
- [ ] Os stacks vizinhos (`mcrm`, `creativeos`) seguem saudáveis
- [ ] Gate check passes: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`
- [ ] Test count: all tests pass (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `docs(deploy): record redesign v2 production rollout`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9 → T10 → T11 → T12
Phase 3:  T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20 → T21 → T22
Phase 4:  T23 → T24 → T25 → T26
```

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: tokens, fontes, base | 1 conjunto de CSS | ✅ Granular |
| T2: visão de lotes | 1 módulo | ✅ Granular |
| T3: primitivos de UI | 1 pasta de componentes com a mesma API | ⚠️ Coeso |
| T4 e T5: casca | 1 área cada | ✅ Granular |
| T6 a T12: fluxo principal | 1 tela cada | ✅ Granular |
| T13 a T22: telas de apoio | 1 tela cada (T19 junta duas telas gêmeas) | ⚠️ Coeso |
| T23 a T26: fechamento | 1 entrega cada | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T14 a T22 | tarefa anterior | cadeia sequencial | ✅ Match |
| T24 a T26 | tarefa anterior | cadeia sequencial | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Tokens e CSS | unit | unit | ✅ OK |
| T2 | Visão de lotes | unit | unit | ✅ OK |
| T3 | Primitivos de UI | unit | unit | ✅ OK |
| T4, T5 | Casca | e2e | e2e | ✅ OK |
| T6 a T22 | Rotas | e2e | e2e | ✅ OK |
| T23 | Dependências e configuração | none | none | ✅ OK |
| T24, T25 | Rotas (testes) | e2e | e2e | ✅ OK |
| T26 | Dependências e configuração | none | none | ✅ OK |
