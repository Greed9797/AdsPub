# SPEC-003 — Auditoria: importação de relatórios

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-002 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| Upload privado + hash + metadados | parcial | `assets` faz isso p/ mídia (`ingestFile`, sha, S3 privado); nada p/ relatórios tabulares |
| Parser CSV/XLSX determinístico | ausente | sem dep; CSV manual inexistente |
| Mapeamento PT/EN + prévia + confirmação | ausente | — |
| Identidade local estável sem ad_id | ausente | — |
| Sem dividir total, sem zero inventado, sem misturar totais | ausente | — |
| Reimportação sem duplicar | ausente | — |
| Tabelas de observações canônicas | ausente | só `meta_api_calls` (chamadas, não métricas) |

## Decisões de projeto (registradas aqui para o plano)

- CSV com parser próprio (~determinístico, separador `;`/`,`, decimal BR,
  `TextDecoder` utf-8→latin1); XLSX via dep nova `xlsx` (só leitura de aba).
  Limites: 10 MB, 20k linhas, sem macros (xlsx ignora).
- Fluxo síncrono na API (upload → staging → preview → commit), sem fila:
  volume do piloto cabe; fila entra se passar do teto (SPEC-009).
- Colunas canônicas = `docs/data-contracts.md` §2; dicionário PT/EN fixo e
  versionado (`mapping_version: "v1"`).
- Chave canônica = data-contracts §3; duplicata de commit = 409.
