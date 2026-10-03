# Alterações em testes existentes

Cada linha é um teste que já existia e mudou porque o Figma aprovado muda o comportamento de propósito.
Nenhuma asserção foi enfraquecida, removida ou pulada. Revisar antes do merge.

| Tarefa | Arquivo | O que mudou | Por quê |
| ------ | ------- | ----------- | ------- |
| T5 | `e2e/jornada-1-contas.spec.ts` (teste de 390 px) | Troca o tema indo a `/mais` e volta a `/contas`; a asserção de que a conta continua legível no escuro permanece | No mobile o seletor de aparência passa para a página Mais (Figma M6) |
