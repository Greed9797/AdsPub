# SPEC-006 — Plano técnico

**Escopo:** frames + análise visual versionada + revisões. Sem transcrição
real (adaptador + `unavailable` visível), sem relatório (007). Migração
aditiva. Zero escrita Meta; analisador sem credencial Meta.

## Decisões

1. **Pacote `packages/creative-intel`.** `sampler.ts` (ffprobe duração +
   ffmpeg frames JPEG na grade densa-abertura + áudio wav; tetos:
   60s/12 frames/50 MB, `runIf(ffmpeg)` nos testes), `transcribe.ts`
   (interface + `unavailableTranscriber`), `analyze.ts` (Anthropic vision
   via invoker estendido com `images[]`, tool use forçado, JSON validado,
   custo/latência, cache por asset+prompt+schema).
2. **Invoker com imagens, compatível.** `AiToolRequest.images?` (base64);
   `anthropicInvoker` monta blocos `image` + `text`. Chamadores atuais
   intactos.
3. **Tabela `content_analyses`.** asset + sha do conteúdo + versões
   (prompt/modelo/schema) + achados + cobertura (intervalos observados e
   não-inspecionados) + custo. Correção humana = nova revisão, original
   preservado (`superseded_by`).
4. **Contrato de saída.** `{asset_id, observations[{tipo, texto,
   evidence_refs:[{kind:frame|transcript, t, detalhe}]}], coverage,
   limitations[], model, prompt_version, schema_version}`. Sem mídia não há
   chamada (404 `MEDIA_REQUIRED`); sem performance não há veredicto — só
   conteúdo (AC-006-03/07).
5. **Rota síncrona com teto.** `POST /assets/:id/analyses` (admin/
   coordinator/manager com escopo? escopo é por conta; asset é por cliente
   — exige papel manager+, sem escopo fino: documentado) e `GET`
   + `PATCH` (correção → nova revisão). Timeout 120s; fila em 009 se doer.

## Arquivos reais

- `packages/creative-intel/*` + testes (runIf ffmpeg); `ai/src/invoker.ts`
  (images); `packages/db` tabela + repo; rotas + UI mínima em `/criativos`
  (botão Analisar + achados)? UI: linha na página do asset — seção simples.
- Prompt `content.v1.md` no pacote.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Instrução em nome/transcrição nunca vira ação: teste injeta e confere.
