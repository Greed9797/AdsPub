# SPEC-006 — Auditoria: análise multimodal

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-005 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| ffprobe metadados + thumb | implementado | `packages/media/src/index.ts` (R8/FR-004) |
| ffmpeg frames/áudio amostrado | ausente | só 1 thumb em 1s |
| Adaptador de transcrição | ausente | nenhum provedor aprovado, nenhuma key |
| Análise visual IA com evidências | ausente | invoker só-texto (`ai/src/invoker.ts`) |
| JSON validado + custo/latência/cache | parcial | padrão existe p/ plano/copy (`client.ts`); sem uso visual |
| Revisão humana versionada | ausente | — |
| Prompt injection como conteúdo | ausente | — |

## Desvio honesto registrado

AC-006-01 exige transcrição PT: **sem provedor aprovado não há
transcrição real**. Entrega: pipeline com etapa de transcrição explícita que
registra `unavailable` visível + adaptador plugável. Análise de conteúdo
vale por frames; cruzamento com fala fica pendente de decisão (lista do
roadmap). Nenhum teste finge transcrever.
