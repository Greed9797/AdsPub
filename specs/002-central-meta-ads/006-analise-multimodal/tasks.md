# SPEC-006 — Tarefas (rastreabilidade FR → AC → tarefa → teste)

**Status inicial:** todas pendentes. Marcar `[x]` só com evidência do gate.

## T-006-1 — Amostragem e transcrição (FR-006-01, FR-006-02)

- [x] T-006-1a `sampler.ts`: duração via ffprobe + frames (grade abertura-densa) + áudio wav; tetos e erros claros; teste `runIf(ffmpeg)` + teste puro da grade.
- [x] T-006-1b `transcribe.ts`: interface + `unavailable` visível; pipeline registra sem fingir (AC-006-01 parcial honesta).

## T-006-2 — Análise visual (FR-006-03..07)

- [x] T-006-2a Invoker com `images[]` (compatível); teste com invoker falso.
- [x] T-006-2b `analyze.ts`: tool use forçado, JSON validado, evidence_refs com timestamp, custo/latência, cache por conteúdo; teste com invoker falso (AC-006-04/05).
- [x] T-006-2c Tabela `content_analyses` + revisões preservadas; teste (AC-006-06 parcial: cobertura registrada).
- [x] T-006-2d Rotas `POST/GET/PATCH /assets/:id/analyses` + seção na UI; injeção maliciosa não altera formato nem acessa Meta (AC-006-07); teste.
- [x] T-006-2e Imagem estática sem estatística de vídeo; sem mídia = 404 (AC-006-02/03); teste.

## Gate final SPEC-006

- [x] Gate frio completo verde + auditoria atualizada com desvios.
