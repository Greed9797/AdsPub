# Matriz de capacidades Meta (SPEC-001 / AC-001-06)

**Versão-alvo:** `v25.0` (`META_API_VERSION`). **Regra:** estado `validada`
exige evidência (comando, ambiente, conta, data). Campo só-listado-no-SDK é
`não-validada` — nunca `validada`. Teste trava isso em
`scripts/test/capability-matrix.test.ts`.

| Capacidade | Estado | Evidência |
|---|---|---|
| Ler `/me`, contas, páginas, IGs, pixels da BM | validada | `devices` CI + smoke `sync` conta `act_1030000000001` (Graph falsa), 2026-09-10 |
| Ler campanhas/conjuntos ativos | validada | smoke `sync` + fases SC-004 (Graph falsa), 2026-09-10 |
| Criar campanha/conjunto/anúncio `PAUSED` imagem única | validada | smoke US5 + `write.test.ts` corpos `PAUSED` (Graph falsa), 2026-09-10 |
| Criar anúncio `PAUSED` vídeo único | validada | smoke (upload start→transfer→finish + polling) + `write.test.ts` (Graph falsa), 2026-09-10 |
| Criar anúncio `PAUSED` carrossel 2–10 cartões | validada | `write.test.ts` + `buildCreativePayload` R9 (Graph falsa), 2026-09-10 |
| Ler status de revisão em batch (≤50) | validada | smoke `status-poll` + `ads_status_batch.json` (Graph falsa), 2026-09-10 |
| Arquivar anúncio/campanha | validada | `smoke-sandbox.ts` + `archiveAd` (Graph falsa), 2026-09-10 |
| Tier observado via headers de uso | validada | `parseUsageHeaders` + teste `rate-limit.test.ts`, 2026-09-10 |
| Insights síncrono (`getInsights`) | não-validada | SDK lista o campo; sem chamada real em conta autorizada |
| Insights assíncrono (`AdReportRun`) | não-validada | SDK lista a operação; sem job real observado |
| Breakdowns (idade, placement, região) | não-validada | combinações variam por conta; validar no gate de integração |
| Métricas de vídeo (plays, ThruPlay, %) | não-validada | definições por fonte; validar mapeamento antes de exibir |
| `video_status` além de processing/ready | não-validada | só os dois estados cobertos por fixture |
| Permissões além das 4 (`ads_management`, `business_management`, `pages_read_engagement`, `pages_manage_ads`) | não-validada | candidatas por fluxo, não configuração aprovada |
| Contas de clientes compartilhados (não-owned) | não-validada | propriedade vs compartilhamento a verificar na conta real |

Mudar um estado exige atualizar a linha + evidência no mesmo commit.
