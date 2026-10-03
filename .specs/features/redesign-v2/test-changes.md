# Alterações em testes existentes

Cada linha é um teste que já existia e mudou porque o Figma aprovado muda o comportamento de propósito.
Nenhuma asserção foi enfraquecida, removida ou pulada. Revisar antes do merge.

| Tarefa | Arquivo | O que mudou | Por quê |
| ------ | ------- | ----------- | ------- |
| T5 | `e2e/jornada-1-contas.spec.ts` (teste de 390 px) | Troca o tema indo a `/mais` e volta a `/contas`; a asserção de que a conta continua legível no escuro permanece | No mobile o seletor de aparência passa para a página Mais (Figma M6) |
| T11 | `e2e/fixtures.ts` (`criarLoteComIa`) | `getByRole('combobox', { name: /^Modo/ }).selectOption('ai')` vira `getByRole('radio', { name: /Planejamento com IA/ }).check()` | O modo deixa de ser um `<select>` e passa a cartões selecionáveis (RDS-31); o valor enviado (`mode=ai`) é o mesmo |
| T11 | `e2e/jornada-4-manual.spec.ts` | `selectOption('manual')` vira `getByRole('radio', { name: /Criação manual/ }).check()` | Mesmo motivo; o valor enviado (`mode=manual`) é o mesmo |

## Resumo (T24)

3 linhas de testes existentes foram alteradas em todo o redesign, todas porque o Figma troca o controle de propósito:
T5 (tema vai para a página Mais no mobile) e T11 (o modo vira cartões, em 2 pontos). Nenhum teste foi removido,
enfraquecido ou pulado. Suíte ao fim da T23: vitest 544, e2e 93 (as 16 jornadas originais mais 77 novas).
