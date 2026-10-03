# Redesign v2 do AdPub Specification

## Problem Statement

O front atual (`apps/web`) usa a biblioteca Astryx com um tema inspirado no Linear: barra lateral de 11 itens, formulários soltos e pouca hierarquia de estado. O redesign v2 (Figma `2NVoAvTtfLnlkjewEoZTtp`, página 02) define o sistema visual W3bsite claro, 17 quadros de desktop, 6 de mobile e os estados de erro. Precisamos aplicar esse desenho no código sem mudar a API, as server actions nem as permissões, e colocar o resultado em produção.

## Goals

- [ ] As 14 rotas autenticadas e o login usam o visual do Figma e nenhuma importa `@astryxdesign`.
- [ ] Nenhuma regressão funcional: as 16 jornadas e2e passam, com texto atualizado só onde o Figma muda a copy de propósito.
- [ ] Em 390 px nenhuma rota tem rolagem horizontal da página.
- [ ] Produção (`https://adpub.179-198-104-210.sslip.io`) roda o novo front, com `/login` em 200 e `/api/v1/health` ok.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| Novos endpoints ou campos na API | O redesign só apresenta dados que já existem |
| Tema escuro desenhado no Figma | O Figma só tem o claro; o escuro é derivado (ver Assumptions) |
| Atalhos de teclado além de busca (`/`, ⌘K) e Esc | O resto é proposta de UX sem backing; não entra no rodapé |
| Fotos e ilustrações novas | O app não tem acervo; miniaturas usam a mídia real ou um bloco neutro |
| Storybook ou biblioteca de componentes publicada | Não pedido |
| Internacionalização | O produto é PT-BR |
| Alterar auth, papéis ou rotas | Fora do escopo visual |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Tema escuro | Mantém Claro, Escuro e Sistema; o escuro usa tokens derivados (papel e tinta invertidos, mesmo laranja) | O produto já tem o seletor; remover seria perda de função | n |
| Dado que a API não entrega | Coluna ou bloco só aparece se o dado existir; hoje ficam de fora o orçamento por lote e o responsável | Regra de entrega: sem mock nem placeholder | y |
| Atalhos no rodapé | O rodapé lista só os implementados: `/` ou ⌘K foca a busca, Esc fecha a ficha | Não prometer o que não existe | n |
| Estados do quadro de pontos | 11 grupos: os 9 do Figma mais "Falhou" e "Conferir" | O Figma omitiu `failed` e `needs_reconciliation`; omitir esconderia perdas | n |
| Quando o lote entra na fila de publicação | Status `ready` com `approval.approved` verdadeiro | Equivale a "validado e aprovação válida" no código | n |
| Rótulo "Sincronizado" na barra superior | Maior `last_synced_at` de `GET /ad-accounts`; some se a API falhar | Dado real, sem nova chamada | n |
| Busca global | Envia para `/?q=` (parâmetro que a home já lê) | Reaproveita o filtro existente | y |
| Fontes | Geist pelo pacote `geist` (já no repo) e Nunito pelo pacote `@fontsource-variable/nunito`, sem rede no build | `next/font/google` quebrou o CI no runner | y |
| Migração | CSS antigo fica como `legacy.css` até a última rota migrar; novo CSS usa o prefixo `ap-` | Evita meio app quebrado a cada tarefa | y |
| Deploy | Um deploy só, depois de todas as rotas migradas e do e2e verde | Meia migração mistura duas interfaces em produção | y |
| Rótulos de acessibilidade usados no e2e | Preservados, exceto onde o Figma troca a copy (listados em `tasks.md` T21) | O e2e é o contrato de comportamento | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Sistema visual e casca do app ⭐ MVP

**User Story**: As a operador, I want uma navegação por tarefa com o estado da sincronização à vista so that eu ache qualquer tela em um clique.

**Why P1**: Todas as telas dependem dos tokens, dos componentes e da casca.

**Acceptance Criteria** (each line is one EARS pattern):

1. [RDS-01] The system SHALL ler toda cor, raio e tipografia de variáveis CSS definidas em um único arquivo de tokens, com os valores das variáveis do Figma (`fundo/página` #F3F1EA, `fundo/superfície` #FBFAF6, `texto/1` #0F0F0D, `destaque/laranja` #FF5701, `destaque/texto` #C24100, `alerta/erro` #B3261E).
2. [RDS-02] The system SHALL renderizar títulos e números grandes em Nunito Bold, texto em Geist e dados, rótulos e REF em Geist Mono.
3. [RDS-03] The system SHALL concluir `next build` sem acesso à rede.
4. [RDS-04] WHEN um usuário autenticado abre qualquer rota THEN the system SHALL mostrar a barra superior com as abas Lotes, Criativos, Performance, Contas e Gestão, a busca, o rótulo de sincronização, o avatar e o botão Sair.
5. [RDS-05] WHEN a aba Contas ou Gestão é aberta THEN the system SHALL listar as páginas do grupo, filtradas por papel e por flag, igual ao menu atual (Auditoria só admin e coordenador, Usuários só admin, Inteligência e Relatórios só com a flag ligada).
6. [RDS-06] WHILE a largura da viewport é de até 768 px the system SHALL mostrar a barra inferior com Lotes, Criativos, Performance, Contas e Mais, e a página "Mais" com os demais destinos e o seletor de aparência.
7. [RDS-07] WHEN o usuário escolhe Claro, Escuro ou Sistema THEN the system SHALL gravar o cookie `adpub_theme` e aplicar `data-theme` no servidor, como hoje.
8. [RDS-08] WHEN a API de contas falha THEN the system SHALL renderizar a casca sem o rótulo de sincronização, sem erro na página.
9. [RDS-09] The system SHALL exibir foco visível (borda de tinta e anel laranja de 3 px a 35%) em todo controle interativo.

**Independent Test**: Abrir `/` em 1440 px e em 390 px e conferir abas, menus por papel, rodapé e troca de tema.

---

### P1: Lotes (lista) ⭐ MVP

**User Story**: As a gestor de mídia, I want ver o estado de todos os anúncios e de cada lote de relance so that eu saiba o que precisa de mim.

**Why P1**: É a tela inicial e onde o fluxo começa.

**Acceptance Criteria**:

1. [RDS-10] WHEN a rota `/` carrega THEN the system SHALL mostrar o quadro de pontos com 1 ponto por anúncio, agrupado em 11 estados: Rascunho, Bloqueado, Pronto, Na fila, Publicando, Publicado, Em análise, Aprovado, Reprovado, Falhou e Conferir.
2. [RDS-11] The system SHALL contar nos "Precisam de atenção" os anúncios em Bloqueado, Reprovado, Falhou e Conferir.
3. [RDS-12] WHEN o usuário aciona um grupo do quadro ou um filtro "Mostrar na lista" THEN the system SHALL filtrar a lista pelo estado via parâmetro de URL, mantendo conta, busca e visão.
4. [RDS-13] The system SHALL desenhar em cada linha de lote uma barra de pipeline com um segmento por estado, largura do segmento proporcional à contagem de anúncios e largura total proporcional ao total de anúncios do lote.
5. [RDS-14] WHERE existe lote com status `ready` e `approval.approved` verdadeiro the system SHALL mostrar a fila de publicação com um chip por lote e o botão "Revisar e publicar".
6. [RDS-15] IF nenhum lote atende aos filtros THEN the system SHALL mostrar o estado vazio com "Novo lote" apenas para papéis diferentes de `viewer`.
7. [RDS-16] WHILE a largura é de até 768 px the system SHALL trocar a tabela por cartões de lote com a mesma informação.

**Independent Test**: Com lotes em estados variados, conferir contagens do quadro, o filtro por grupo e a barra de cada linha.

---

### P1: Lote aberto, ficha do anúncio e publicação ⭐ MVP

**User Story**: As a gestor, I want revisar cada anúncio e publicar com a verdade à vista so that nada seja criado na Meta por engano.

**Why P1**: É o fluxo central e o que o e2e mais exercita.

**Acceptance Criteria**:

1. [RDS-20] WHEN `/lotes/[id]` carrega THEN the system SHALL mostrar a lista de anúncios com miniatura, referência, etapas na Meta (5 segmentos) e selo de estado, e a estrutura compartilhada (campanha e conjuntos) com o estado de cada ref.
2. [RDS-21] WHEN o usuário abre um anúncio THEN the system SHALL mostrar a ficha lateral com prévia, textos editáveis, checklist de validação e dados de campanha e conjunto, sem sair da lista.
3. [RDS-22] WHEN o usuário salva um anúncio THEN the system SHALL avisar que a aprovação do lote caiu e exigir nova validação antes de publicar.
4. [RDS-23] WHEN o usuário aciona "Revisar e publicar" THEN the system SHALL abrir a revisão final com lotes, conta, anúncios, orçamento, saldo diário e o aviso de que tudo é criado pausado na Meta.
5. [RDS-24] IF o número de anúncios excede o saldo diário da conta THEN the system SHALL avisar quantos não entram hoje e oferecer publicar só o que cabe.
6. [RDS-25] WHEN a publicação começa THEN the system SHALL mostrar o andamento por lote e manter o acompanhamento fora da janela.
7. [RDS-26] IF um item ou ref está em `needs_reconciliation` THEN the system SHALL mostrar o painel de conferência com as ações existentes e nunca recriar sozinho.
8. [RDS-27] WHERE o papel é `viewer` the system SHALL ocultar todas as ações de edição e publicação.
9. [RDS-28] IF a validação do lote falha THEN the system SHALL listar cada erro com o item e o que corrigir.

**Independent Test**: Criar lote, abrir um anúncio, editar, validar, revisar e publicar contra a Meta falsa do e2e.

---

### P1: Novo lote ⭐ MVP

**User Story**: As a gestor, I want montar um lote escolhendo cliente, conta, modo e mídias so that a IA ou eu preparemos os anúncios.

**Why P1**: Sem ele não há lote novo.

**Acceptance Criteria**:

1. [RDS-30] WHEN `/lotes/novo` carrega THEN the system SHALL mostrar as etapas Cliente e conta, Como montar e Fotos e vídeos, o resumo do lote e a barra de ação.
2. [RDS-31] WHEN o usuário escolhe o modo IA ou manual THEN the system SHALL mostrar a opção como cartão selecionável com o mesmo valor submetido hoje.
3. [RDS-32] IF mídias × variações excede o saldo diário da conta selecionada THEN the system SHALL avisar no resumo antes de criar.
4. [RDS-33] IF o formulário é enviado com erro de validação THEN the system SHALL manter os dados digitados e mostrar a mensagem no campo.
5. [RDS-34] WHILE o lote é criado the system SHALL desabilitar o botão de envio.

**Independent Test**: Criar um lote com IA e outro manual e conferir o resumo e o aviso de limite.

---

### P1: Acesso

**User Story**: As a usuário, I want entrar com e-mail e senha so that eu use o app.

**Why P1**: É a porta de entrada.

**Acceptance Criteria**:

1. [RDS-40] WHEN `/login` carrega THEN the system SHALL mostrar as abas Entrar e Primeiro acesso com os campos e ações existentes.
2. [RDS-41] IF o login falha THEN the system SHALL mostrar a mensagem de erro no formulário sem recarregar os campos.
3. [RDS-42] WHERE o bootstrap está disponível the system SHALL mostrar a aba Primeiro acesso, e quando não está the system SHALL escondê-la.

**Independent Test**: Entrar com credenciais válidas e inválidas.

---

### P2: Telas de apoio

**User Story**: As a operador, I want as demais telas com a mesma linguagem so that o produto seja coerente.

**Why P2**: Valor igual ao das P1, mas sem bloquear o fluxo principal.

**Acceptance Criteria**:

1. [RDS-50] WHEN `/criativos` carrega THEN the system SHALL mostrar o quadro de validação, os filtros, a grade de mídias com selo de estado e a barra de seleção, mantendo upload e importação do Drive.
2. [RDS-51] WHEN `/contas` carrega THEN the system SHALL mostrar as conexões, a tabela de contas e a ficha de padrões da conta, mantendo criar, testar, sincronizar e trocar token.
3. [RDS-52] WHEN `/clientes` carrega THEN the system SHALL mostrar a tabela e a ficha do cliente, mantendo criar e editar.
4. [RDS-53] WHEN `/saude` carrega THEN the system SHALL mostrar o resumo, a tabela por conta e o alerta da conta em atenção.
5. [RDS-54] WHEN `/whatsapp` carrega THEN the system SHALL mostrar números, modelos e o envio de teste, mantendo conectar, criar modelo e enviar.
6. [RDS-55] WHEN `/performance` carrega THEN the system SHALL mostrar filtros, KPIs, gasto por dia, custo por resultado e a tabela, com período e origem dos dados sempre visíveis.
7. [RDS-56] WHEN `/inteligencia` ou `/relatorios` carrega THEN the system SHALL mostrar o relatório de hipóteses e a revisão de importação, mantendo gerar, importar e confirmar.
8. [RDS-57] WHEN `/auditoria` carrega THEN the system SHALL mostrar filtros e a tabela com "Ver alterações" expansível por evento.
9. [RDS-58] WHEN `/usuarios` carrega THEN the system SHALL mostrar a tabela, a ficha com papel, contas e senha, e a explicação do papel.
10. [RDS-59] IF um valor exibido não existe nos dados THEN the system SHALL omitir o bloco em vez de inventar o valor.

**Independent Test**: Abrir cada rota com dados do seed e conferir título, tabela e ações.

---

### P2: Estados e produção

**User Story**: As a usuário, I want saber o que houve quando algo falha so that eu tenha a próxima ação.

**Why P2**: Cobre o erro e a entrega.

**Acceptance Criteria**:

1. [RDS-70] IF uma rota não consegue carregar da API THEN the system SHALL mostrar o erro com o que houve, o código da requisição e "Tentar de novo".
2. [RDS-71] IF uma rota não existe THEN the system SHALL mostrar a página de não encontrado com o caminho de volta.
3. [RDS-72] WHILE uma rota carrega the system SHALL mostrar o esqueleto da lista.
4. [RDS-73] IF o papel não permite a rota THEN the system SHALL mostrar a página de somente leitura ou de permissão com o motivo.
5. [RDS-90] WHEN o novo front é implantado em produção THEN the system SHALL responder 200 em `/login` e `ok` em `/api/v1/health`, e as migrações 0000 a 0021 SHALL estar aplicadas.
6. [RDS-91] The system SHALL manter texto com contraste de pelo menos 4,5:1 sobre o fundo em claro e em escuro.

**Independent Test**: Forçar erro da API, rota inexistente e papel `viewer`, e conferir os estados.

---

## Edge Cases

- IF a API de lotes devolve lista vazia THEN the system SHALL mostrar o quadro com zero pontos e o estado vazio.
- IF um lote tem zero anúncios THEN the system SHALL desenhar a barra de pipeline vazia sem erro de divisão.
- IF um nome de lote ou anúncio é longo THEN the system SHALL truncar com reticências sem quebrar a linha.
- WHEN há 200 ou mais lotes THEN the system SHALL manter a lista rolável na mesma página, como hoje.
- IF o cookie de tema tem valor inválido THEN the system SHALL usar Sistema.
- WHEN o JavaScript do cliente está desligado THEN the system SHALL manter os filtros e a navegação funcionando por links e formulários.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RDS-01 | P1: Sistema visual e casca | Design | Implementing |
| RDS-02 | P1: Sistema visual e casca | Design | Implementing |
| RDS-03 | P1: Sistema visual e casca | Design | Implementing |
| RDS-04 | P1: Sistema visual e casca | Design | Implementing |
| RDS-05 | P1: Sistema visual e casca | Design | Implementing |
| RDS-06 | P1: Sistema visual e casca | Design | Pending |
| RDS-07 | P1: Sistema visual e casca | Design | Implementing |
| RDS-08 | P1: Sistema visual e casca | Design | Implementing |
| RDS-09 | P1: Sistema visual e casca | Design | Implementing |
| RDS-10 | P1: Lotes | Design | Implementing |
| RDS-11 | P1: Lotes | Design | Implementing |
| RDS-12 | P1: Lotes | Design | Implementing |
| RDS-13 | P1: Lotes | Design | Implementing |
| RDS-14 | P1: Lotes | Design | Implementing |
| RDS-15 | P1: Lotes | Design | Pending |
| RDS-16 | P1: Lotes | Design | Pending |
| RDS-20 | P1: Lote aberto e publicação | Design | Pending |
| RDS-21 | P1: Lote aberto e publicação | Design | Pending |
| RDS-22 | P1: Lote aberto e publicação | Design | Pending |
| RDS-23 | P1: Lote aberto e publicação | Design | Pending |
| RDS-24 | P1: Lote aberto e publicação | Design | Pending |
| RDS-25 | P1: Lote aberto e publicação | Design | Pending |
| RDS-26 | P1: Lote aberto e publicação | Design | Pending |
| RDS-27 | P1: Lote aberto e publicação | Design | Pending |
| RDS-28 | P1: Lote aberto e publicação | Design | Pending |
| RDS-30 | P1: Novo lote | Design | Pending |
| RDS-31 | P1: Novo lote | Design | Pending |
| RDS-32 | P1: Novo lote | Design | Pending |
| RDS-33 | P1: Novo lote | Design | Pending |
| RDS-34 | P1: Novo lote | Design | Pending |
| RDS-40 | P1: Acesso | Design | Pending |
| RDS-41 | P1: Acesso | Design | Pending |
| RDS-42 | P1: Acesso | Design | Pending |
| RDS-50 | P2: Telas de apoio | Design | Pending |
| RDS-51 | P2: Telas de apoio | Design | Pending |
| RDS-52 | P2: Telas de apoio | Design | Pending |
| RDS-53 | P2: Telas de apoio | Design | Pending |
| RDS-54 | P2: Telas de apoio | Design | Pending |
| RDS-55 | P2: Telas de apoio | Design | Pending |
| RDS-56 | P2: Telas de apoio | Design | Pending |
| RDS-57 | P2: Telas de apoio | Design | Pending |
| RDS-58 | P2: Telas de apoio | Design | Pending |
| RDS-59 | P2: Telas de apoio | Design | Pending |
| RDS-70 | P2: Estados e produção | Design | Pending |
| RDS-71 | P2: Estados e produção | Design | Pending |
| RDS-72 | P2: Estados e produção | Design | Pending |
| RDS-73 | P2: Estados e produção | Design | Pending |
| RDS-90 | P2: Estados e produção | Design | Pending |
| RDS-91 | P2: Estados e produção | Design | Pending |

**Coverage:** 49 total, 0 mapped to tasks, 49 unmapped ⚠️

---

## Success Criteria

How we know the feature is successful:

- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e as 16 jornadas e2e passam, e `grep -r "@astryxdesign" apps/web/src` não retorna nada.
- [ ] Comparação visual das 14 rotas e do login com os quadros do Figma, em 1440 e 390 px, sem corte de texto nem rolagem horizontal da página.
- [ ] Produção responde 200 em `/login` e `ok` em `/api/v1/health` com as 22 migrações aplicadas.
