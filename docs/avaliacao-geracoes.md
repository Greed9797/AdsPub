# Avaliação de gerações (plano e copies)

Achado A12 do diagnóstico: sem baseline, qualquer mudança de prompt é fé.
Este documento define como medir antes de mexer no prompt ou no modelo.

## O que roda automático

```bash
ANTHROPIC_API_KEY=... pnpm tsx scripts/eval-generations.ts
ANTHROPIC_API_KEY=... pnpm tsx scripts/eval-generations.ts --case inverno-cupom --model claude-sonnet-4-6
ANTHROPIC_API_KEY=... pnpm tsx scripts/eval-generations.ts --strict   # falha se houver violação
```

Casos em `scripts/eval-cases.json`: briefing, perfil de voz do cliente,
criativos e o que se espera. O script chama o provedor real, grava
`tmp/eval-generations-<timestamp>.json` com plano, violações, tokens, custo e
latência, e imprime o resumo.

Comparação entre prompts/modelos é entre dois arquivos de saída: mesmos
casos, mesmo número de violações? Mesmo custo? Mesma latência? Nunca roda no
CI — consome API paga e a nota final é humana.

### Checagens determinísticas (o que o script reprova sozinho)

| Código | Reprova quando |
| --- | --- |
| `plan.empty` | plano sem itens |
| `plan.copies_per_creative` | item com número de copies diferente do briefing |
| `plan.format` | formato do item diferente do esperado pelo caso |
| `plan.forbidden_term` | termo proibido do cliente apareceu em qualquer texto |
| `plan.missing_mention` | oferta/cupom obrigatório não apareceu em nenhuma copy |
| `plan.headline_too_long` | título acima do teto do caso (padrão dos casos: 40) |

As checagens vivem em `packages/ai/src/eval.ts` (`checkPlan`) e têm teste
unitário em `packages/ai/test/eval.test.ts`. `--dry-run` confere que os casos
carregam, sem chamar o provedor.

## Rubrica humana (1 a 5 por caso)

O que a máquina não julga, uma pessoa julga. Anote no arquivo de saída.

1. **Fidelidade ao briefing** — o plano só usou fatos do briefing e do perfil?
   Inventou oferta, prazo ou público?
2. **Voz do cliente** — soa como o cliente fala? Respeitou claims permitidos?
3. **Utilidade prática** — um gestor publicaria isso sem reescrever? Quanto
   do texto sobreviveria?
4. **Cobertura de pendências** — o que faltou foi declarado em `notes`, em vez
   de inventado?

Plano aprovado = nenhuma violação determinística + nenhuma nota humana abaixo
de 3. Mudança de prompt que derruba a média dos casos em qualquer critério
não entra.

## Feedback de produção (gravação contínua)

O ciclo fica no próprio lote (`batches.plan_generation_id`, `plan_feedback`,
`plan_regenerations`), porque a linha de `ai_generations` é cache
compartilhado por vários lotes e não serve de dono do feedback:

- `used` — publicado como a IA entregou;
- `edited` — publicado depois de edição humana (campos automáticos não contam);
- `rejected` — plano descartado por regeneração (contador separado, porque um
  lote pode descartar um plano e publicar o seguinte).

Consulta para acompanhar acerto por versão de prompt:

```sql
select g.prompt_version,
       count(*) filter (where b.plan_feedback = 'used')   as usados,
       count(*) filter (where b.plan_feedback = 'edited') as editados,
       sum(b.plan_regenerations)                          as descartados,
       count(*)                                           as lotes
from batches b
join ai_generations g on g.id = b.plan_generation_id
where b.plan_generation_id is not null
  and b.created_at > now() - interval '30 days'
group by g.prompt_version
order by lotes desc;
```

Meta provisória para o piloto: `used` ≥ 40% dos planos com feedback. Abaixo
disso o problema é prompt (ou briefing), não gestor.

## Custo e latência por fluxo

`ai_usage` registra uma linha por tentativa que chegou ao provedor — inclusive
quando a resposta é recusada depois — com finalidade, modelo, tokens, cache,
custo estimado e latência. O painel operacional (`GET /ops/metrics`) lê
`ai_cost_usd` daí; quebrar por finalidade é a mesma tabela agrupada por
`purpose`.
