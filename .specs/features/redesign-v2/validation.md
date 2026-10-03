# Validação: redesign-v2

## Validation

**Result**: PASS

Verificação independente feita depois da T25, sem sub-agentes (o autor das tarefas é o mesmo que verificou, então o
resultado foi ancorado em testes que rodam e em mutantes, não em releitura do código). Intervalo: `b948ec0..9851296`.

## Resultado dos portões

- `pnpm build`, `pnpm lint`, `pnpm typecheck`: verdes.
- vitest: 544 testes passam.
- e2e: 96 passam (as 16 jornadas originais mais 80 novas). Nenhum teste removido ou pulado.
- Alterações em testes existentes: 3 linhas, todas em `.specs/features/redesign-v2/test-changes.md` (tema no mobile e modo como cartões).

## Evidência por requisito (verificada contra o valor esperado da spec)

| Requisito | Evidência |
| --- | --- |
| RDS-01 (sem Astryx, tokens próprios) | `apps/web/src/app/globals.css:1`, `apps/web/package.json:1`; `grep -rI astryx apps/web` não acha nada |
| RDS-04..09 (casca, abas, mobile) | `e2e/redesign-shell.spec.ts:1`, `e2e/redesign-shell-mobile.spec.ts:1` |
| RDS-10..14 (quadro, atenção, filtro, pipeline 18 px, fila) | `e2e/redesign-lotes.spec.ts:30`, `apps/web/test/lotes-view.test.ts:88` |
| RDS-15, RDS-16 (cartões mobile, vazio) | `e2e/redesign-lotes-mobile.spec.ts:30` |
| RDS-20, RDS-27 (etapas, estrutura, viewer) | `e2e/redesign-lote.spec.ts:32`, `apps/web/test/etapas.test.ts:9` |
| RDS-21, RDS-22, RDS-28 (ficha, aprovação cai, erros) | `e2e/redesign-ficha.spec.ts:26` |
| RDS-23..26 (revisão final, saldo, andamento, conferência) | `e2e/redesign-publicar.spec.ts:33`, `apps/web/test/publicacao.test.ts:5` |
| RDS-30..34 (novo lote) | `e2e/redesign-novo-lote.spec.ts:8` |
| RDS-40..42 (acesso) | `e2e/redesign-acesso.spec.ts:9`, `apps/web/test/acesso.test.ts:5` |
| RDS-50..59 (telas de apoio) | `e2e/redesign-criativos.spec.ts:26`, `e2e/redesign-contas.spec.ts:22`, `e2e/redesign-clientes.spec.ts:19`, `e2e/redesign-saude.spec.ts:28`, `e2e/redesign-whatsapp.spec.ts:12`, `e2e/redesign-performance.spec.ts:26`, `e2e/redesign-analise.spec.ts:13`, `e2e/redesign-auditoria.spec.ts:27`, `e2e/redesign-usuarios.spec.ts:27` |
| RDS-70..73 (estados) | `e2e/redesign-estados.spec.ts:13`, `apps/web/test/estados.test.tsx:8` |
| RDS-91 (sem rolagem horizontal, contraste, texto cortado) | `e2e/redesign-visual.spec.ts:60`, `e2e/visual-probes.ts:9` |

## Sensor de discriminação

Seis mutantes aplicados em cópias com restauração (a árvore voltou a `git status --porcelain` vazio): todos mortos.

| Mutante | Testes que falharam |
| --- | --- |
| `apps/web/src/lib/lotes-view.ts:58` 18 px vira 20 px | 1 |
| `apps/web/src/lib/etapas.ts:45` etapa "falhou" vira "em curso" | 2 |
| `apps/web/src/lib/publicacao.ts:14` `<=` vira `<` | 1 |
| `apps/web/src/lib/saude-view.ts:36` `>` vira `>=` | 1 |
| `apps/web/src/lib/acesso.ts:20` aba ativa sempre "primeiro" | 1 |
| `apps/web/src/lib/criativos-view.ts:24` aviso só com 2 ou mais | 3 |

## Lacunas conhecidas (nenhuma bloqueia o merge)

1. O orçamento por conjunto, o gasto por dia, "Usada em N lotes", "Analisando com IA" e a coluna "Responsável" não aparecem: a API não devolve esses dados e a spec (RDS-59) manda omitir em vez de inventar.
2. A barra "Revisar e publicar" abre o primeiro lote da fila: o produto não publica mais de um lote por vez.
3. O esqueleto de carregamento é coberto por render (`apps/web/test/estados.test.tsx:8`), não por e2e, porque o servidor de teste responde rápido demais para capturá-lo.
4. A resposta da página de permissão é HTTP 200, não 403 (o Next já enviou o cabeçalho quando `forbidden()` roda dentro da página); o conteúdo e o motivo aparecem corretamente.
5. Capturas conferidas por olho contra o Figma em lotes, lote aberto e novo lote (1440) e lote aberto (390); as demais passaram só pelas sondas automáticas.
