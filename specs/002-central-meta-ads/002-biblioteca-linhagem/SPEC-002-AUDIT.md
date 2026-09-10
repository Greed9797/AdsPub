# SPEC-002 — Auditoria: biblioteca e linhagem

**Data:** 10/09/2026 · **Base:** `main` pós-SPEC-001 (não commitado).

## Vereditos

| Item | Estado | Evidência |
|---|---|---|
| FR-002-01 assets com hash/origem/tipo/dims/duração, por cliente | implementado | `assets` (`schema.ts:260`): sha256 + unique(cliente, sha), kind, dims, duração, bytes, source drive/upload, validação, thumb; `asset_uploads` por conta |
| FR-002-01 versões imutáveis encadeadas | parcial (aceito) | variante imutável por fingerprint cobre identidade; elo entre versões fica p/ SPEC-006 |
| FR-002-02 `creative_variant` com manifesto imutável | implementado (T-002-1) | `creative_variants` + fingerprint canônico; `validateBatch` deriva; nome fora da identidade |
| FR-002-03 vínculo N:N anúncio↔variante + creative_ids | implementado (T-002-2) | `ad_creative_bindings` com janela + precision; publish abre `confirmed` |
| FR-002-04 upload local + Drive | implementado | rotas `/assets`, import-drive, SSE progresso |
| FR-002-04 vínculo manual p/ mídia histórica | implementado (T-002-3) | `POST /ad-accounts/:id/bindings` precision `manual`, auditado |
| FR-002-05 registrar mudança observada, sem divisão inventada | implementado (T-002-2) | poller detecta troca de `creative_id` → `ambiguous_intraday`, sem dividir métrica |
| FR-002-06 busca/filtros; família explícita | parcial | `/criativos` + seção de variantes com filtros; família semântica fica p/ SPEC-006 |
| AC-002-01 mesmo arquivo em 2 anúncios = 1 asset | implementado | dedupe sha (T041) |
| AC-002-02 mesmo vídeo + copy diferente = variantes distintas | implementado | teste fingerprint + smoke (2 copies = 2 variantes) |
| AC-002-03 nomes repetidos sem associação destrutiva | implementado | vínculo só por fingerprint; rota manual; smoke prova mesmo-nome/conteúdo-diferente |
| AC-002-04 multi-mídia sem performance por peça | implementado | vínculo guarda composição completa; sem motor, nada há p/ dividir (travado em teste) |
| AC-002-05 intradiário + só-diária = ambíguo | implementado | `detectCreativeChange` + teste unitário |
| AC-002-06 mídia ausente, sem descrição inventada | implementado | precision `media_missing` no publish quando assets faltam |

## Risco principal

Sem identidade de variante, SPEC-003–007 não têm o que referenciar. É o
gargalo do pacote: fazer agora, mínimo e imutável.
