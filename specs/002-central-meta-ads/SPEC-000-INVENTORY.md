# SPEC-000 — Inventário e preservação da publicação

**Data:** 10/09/2026 · **Base auditada:** `main` em `e17a71f` · **Pacote:** `Downloads/meta-ads-spec-driven` v0.1.
Nada aqui presume: cada afirmação cita arquivo real. Comandos rodados hoje nesta máquina, seção 8.

## 1. Base encontrada (implementado)

- Monorepo pnpm/Turbo: `apps/{web,api,worker}`, `packages/{shared,db,meta-client,ai,rules,crypto,config,auth,assets,media,storage,telemetry}`. Node ≥22.
- API Fastify `/api/v1/*`, erros RFC 9457 (`apps/api/src/lib/problem.ts`), RBAC + escopo por conta (`batchInScope`, `assertAccountAccess` em `apps/api/src/routes/batches.ts`), bloqueio otimista (`version` + `expectedVersion` em `packages/db/src/repos/batches.ts:86-96`, `drafts.ts:176-183`).
- Worker único executor Meta (`apps/worker`). Filas `adpub.publish`, `adpub.sync`, `adpub.drive-import`, `adpub.status-poll` (`packages/config/src/constants.ts`). `META_TIER` limited/full, concorrência 1/3.
- Publicação em etapas com checkpoint: `publish_jobs.step` (`upload_media → ensure_campaign → ensure_adset → create_creative → create_ad → done`), `meta_ids` por etapa, retomada na etapa salva (`apps/worker/src/publish/pipeline.ts:73-161`). `idempotency_key` por item (T054).
- Dedup intra-lote: `batch_refs` com claim (`apps/worker/src/publish/refs.ts`, `packages/db/src/repos/batch-refs.ts`). Uma execução por item via lease `claimDraft` (`packages/db/src/repos/locks.ts`), contenção reagenda sem gastar tentativa (`apps/worker/src/publish/handler.ts`).
- Segredos: AES-256-GCM + `MASTER_KEY` fora do banco, `mask()`/`redact()`, `appsecret_proof` em toda chamada. CI com gitleaks + scan SC-006 nos logs.
- Auditoria 100%: `audit_log` em conexões, lotes, itens, retry, publish (`apps/api/src/services/publish.ts:91-104`).
- Sync só leitura: `apps/worker/src/poll/status.ts` chama `getAdsStatus` e atualiza `effective_status`/`review_feedback`; nenhuma mutação de entrega.
- Sync conexões/páginas/IGs/pixels/campanhas a cada 6h; `needs_attention` pausa filas da conexão; alerta Slack/e-mail; teto diário (`DEFAULT_DAILY_AD_CAP = 200`).
- Health por conta (`GET /ad-accounts/{id}/health`), telas `/contas`, `/criativos`, `/lotes`, `/saude`, `/auditoria`, `/usuarios`.

## 2. Vereditos AC-000

| AC | Estado | Evidência |
|---|---|---|
| AC-000-01 novos objetos saem PAUSED, evidência vinculada ao item | implementado | `packages/meta-client/src/write/index.ts:148,170,208` hardcoded; `meta_ids` + auditoria por etapa em `pipeline.ts` |
| AC-000-02 pedido ACTIVE rejeitado antes de qualquer efeito | implementado | nenhum DTO de escrita aceita `status`; `publishBody` é `.strict()` (`routes/batches.ts`); teste `apps/api/test/publish-body.test.ts` + caracterização em `write.test.ts` |
| AC-000-03 timeout ambíguo não duplica; reconcilia ou RECONCILIATION_REQUIRED | implementado (T-000-2) | `isAmbiguousError` só para resposta perdida (`errors.ts`); estado `needs_reconciliation` + rota resolve + `UnrecoverableError` sem gastar tentativa; fase no smoke |
| AC-000-04 mudança relevante invalida aprovação | implementado (T-000-3) | `approval_fingerprint` congelado no validate, exigido no publish (422 se divergir); edição revalida e recalcula; tempos de estágio persistidos |
| AC-000-05 sync de ACTIVE externo só observa | implementado | `poll/status.ts:45-83` só lê e atualiza observação |
| AC-000-06 inventário com arquivos e comandos reais | este documento + seção 8 | — |

## 3. Gaps FR-000

- FR-000-03: sem entidade `approval` com fingerprint; aprovação = estado `ready` + contagem confirmada. Correção em T-000-3.
- FR-000-04: sem `RECONCILIATION_REQUIRED`; falha transiente sempre agenda retry. Correção em T-000-2.
- FR-000-06: tempos separados humano/fila/Meta não persistidos; audit tem `batch.create`/`batch.publish`/`published_at`, dá para derivar parcial. Timestamps de estágio em T-000-3.

## 4. Mapa specs 001–009 vs base (Gate 0)

| Spec | Estado base |
|---|---|
| 001 conexões/diagnóstico | parcial: US1 implementado (conexão cifrada, tier, sync, `needs_attention`, RBAC). Falta: matriz de capacidades versionada, revalidação de autorização imediatamente antes da execução do job (publish checa `pausedUntil`, não token vivo) |
| 002 biblioteca/linhagem | parcial: assets SHA-256, thumbs, reuso `image_hash`/`video_id`, `asset_uploads`. Falta: `creative_variant` imutável, vínculo N:N anúncio↔variante, ambiguidade intradiária |
| 003 importação CSV/XLSX | ausente |
| 004 insights sync | ausente (só poll de status; sem Insights, paginação, async report, checkpoints) |
| 005 métricas/dashboard | ausente (só health operacional) |
| 006 multimodal | ausente (ffprobe só valida; sem ffmpeg, transcrição, análise) |
| 007 relatórios IA | ausente |
| 008 aprendizados→rascunho | parcial: duplicação manual existe; sem vínculo hipótese→teste→resultado |
| 009 alertas/operação | parcial: alertas (>20% falha, rate limit, token) existem; sem dedup por regra/janela, sem feature flags, sem restore verificado |

## 5. Riscos do publicador (confirmados no código)

1. Recriação após timeout ambíguo (AC-000-03) — único risco de duplicação restante; concorrência já coberta.
2. Aprovação sem fingerprint (AC-000-04) — janela entre validar e publicar protegida só por revalidação no edit + contagem.
3. Sem revalidação de token no worker antes do create — `pausedUntil` é checado na API, não no handler.
4. Fixtures Meta escritas à mão, não capturadas de conta real (T007 aberto) — contrato trava formato documentado, não observado.

## 6. Não verificado (exige conta real)

Capacidades v25.0 por formato/conta, permissões mínimas efetivas, colunas reais de exportações, transcrição PT, latências/custos reais. Gates 3–4 do roadmap.

## 7. Próximo

`plan.md` + `tasks.md` nesta pasta: só correções T-000-1..T-000-3, sem nova feature, sem migração destrutiva.

## 8. Comandos reais executados hoje (10/09/2026, infra local portas 55432/56379/59000)

`pnpm build --force` 15/15 · `turbo run typecheck --force` 27/27 + `tsc -p tsconfig.scripts.json` · `vitest run` 18 arquivos / 214 testes · `smoke:integration` OK (SC-004, R3, FR-006) · `test:e2e` 3/3 chromium · scan SC-006 limpo. Gitleaks só no CI (sem binário local).
