# Spike da Graph API na conta de teste (T007)

Runbook para reproduzir, no braço, a mesma sequência que o pipeline executa: subir mídia, criar
campanha, conjunto, criativo e anúncio **sempre `PAUSED`**, e arquivar tudo no fim. Serve para três
coisas: validar as permissões do System User, gravar o screencast do App Review (`docs/meta-app-review.md`)
e regravar as fixtures de contrato de `packages/meta-client/test/fixtures/`.

Nada aqui usa segredo real: substitua `<TOKEN>`, `<ACCOUNT_ID>`, `<BUSINESS_ID>`, `<PAGE_ID>`,
`<IG_USER_ID>` e `<APP_SECRET>` pelos valores da sua conta de teste, **fora do repositório**.

## 0. Preparação

A versão da API é a mesma que o produto fixa em `META_API_VERSION` (hoje `v25.0`, ver `.env.example`
e `packages/config/src/env.ts`). O `MetaClient` recusa qualquer valor que não case com `/^v\d+\.\d+$/`.

```bash
export API=v25.0
export TOKEN='<TOKEN>'                 # token de System User, nunca commitar
export APP_SECRET='<APP_SECRET>'
export ACT=act_<ACCOUNT_ID>
export BUSINESS_ID=<BUSINESS_ID>
export PAGE_ID=<PAGE_ID>
export IG_USER_ID=<IG_USER_ID>         # opcional: sem IG o anúncio roda só no Facebook

# Constituição IV: appsecret_proof em toda chamada (packages/crypto → appsecretProof()).
export PROOF=$(printf '%s' "$TOKEN" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')

export G="https://graph.facebook.com/$API"
export AUTH="access_token=$TOKEN&appsecret_proof=$PROOF"
```

Permissões exigidas no token: `ads_management`, `business_management`, `pages_read_engagement`,
`pages_manage_ads`.

## 1. `/me` — o token é de quem?

```bash
curl -sG "$G/me" --data-urlencode "fields=id,name" -d "$AUTH"
```

Mesma chamada que `getMe()` (`packages/meta-client/src/read/index.ts`).
Resposta gravada em **`me.json`**.

Inventário da BM, usado pelo job de sync (`apps/worker/src/sync/connection.ts`):

```bash
curl -sG "$G/$BUSINESS_ID/owned_ad_accounts" \
  --data-urlencode "fields=id,account_id,name,currency,timezone_name,account_status" \
  -d "limit=100&$AUTH"                       # → owned_ad_accounts.json

curl -sG "$G/$BUSINESS_ID/owned_pages" \
  --data-urlencode "fields=id,name,instagram_business_account{id,username}" \
  -d "limit=100&$AUTH"                       # → owned_pages.json

curl -sG "$G/$BUSINESS_ID/owned_instagram_accounts" \
  --data-urlencode "fields=id,username" -d "limit=100&$AUTH"   # → owned_instagram_accounts.json

curl -sG "$G/$ACT/adspixels" --data-urlencode "fields=id,name" -d "limit=100&$AUTH"
                                             # → adspixels.json

curl -sG "$G/$ACT/promote_pages" \
  --data-urlencode "fields=id,name,instagram_business_account{id,username}" \
  -d "limit=100&$AUTH"                       # → promote_pages.json
```

## 2. `act_<ACCOUNT_ID>/adimages` — upload de imagem

```bash
curl -s -X POST "$G/$ACT/adimages" \
  -F "source=@inverno-01.jpg" \
  -F "access_token=$TOKEN" -F "appsecret_proof=$PROOF"
```

Mesma chamada que `uploadImage()` (`packages/meta-client/src/write/index.ts`): multipart com o campo
`source`, e o `hash` sai em `images.<filename>.hash`. Resposta gravada em **`adimages.json`**.

Guarde o hash:

```bash
export IMAGE_HASH=<hash devolvido>
```

## 3. `act_<ACCOUNT_ID>/advideos` — upload retomável em 3 fases

Espelha `startVideoUpload` → `transferVideoChunk` → `finishVideoUpload` (`uploadVideo()` usa
pedaços de 4 MiB por padrão).

### 3.1 `start`

```bash
curl -s -X POST "$G/$ACT/advideos" \
  -d "upload_phase=start" \
  -d "file_size=$(wc -c < video.mp4)" \
  -d "$AUTH"
```

Devolve `upload_session_id`, `video_id`, `start_offset`, `end_offset`.
Resposta gravada em **`advideos_start.json`**.

```bash
export SESSION=<upload_session_id>
export VIDEO_ID=<video_id>
```

### 3.2 `transfer` (repetir até `start_offset == end_offset`)

```bash
# fatia o arquivo no offset devolvido pela chamada anterior
dd if=video.mp4 of=chunk.bin bs=1 skip=<start_offset> count=<end_offset - start_offset> 2>/dev/null

curl -s -X POST "$G/$ACT/advideos" \
  -F "upload_phase=transfer" \
  -F "upload_session_id=$SESSION" \
  -F "start_offset=<start_offset>" \
  -F "video_file_chunk=@chunk.bin" \
  -F "access_token=$TOKEN" -F "appsecret_proof=$PROOF"
```

Cada resposta traz o próximo par de offsets. Resposta gravada em **`advideos_transfer.json`**.

### 3.3 `finish`

```bash
curl -s -X POST "$G/$ACT/advideos" \
  -d "upload_phase=finish" \
  -d "upload_session_id=$SESSION" \
  -d "title=video-inverno" \
  -d "$AUTH"
```

Devolve `{"success":true}`. Resposta gravada em **`advideos_finish.json`**.

### 3.4 Polling de `video_status`

```bash
curl -sG "$G/$VIDEO_ID" --data-urlencode "fields=status" -d "$AUTH"
```

Enquanto `status.video_status` for `processing`, o pipeline lança `VideoNotReadyError` e reagenda a
cada `VIDEO_POLL_INTERVAL_MS` = 15 s, desistindo em `VIDEO_READY_TIMEOUT_MS` = 20 min
(`packages/config/src/constants.ts`). Repita o `curl` no mesmo intervalo.
Respostas gravadas em **`video_status_processing.json`** e **`video_status_ready.json`**.

## 4. `act_<ACCOUNT_ID>/campaigns` — campanha `PAUSED`

Só objetivos `OUTCOME_*` (FR-020; `createCampaign` recusa o resto antes de chamar a rede).

```bash
curl -s -X POST "$G/$ACT/campaigns" \
  -d "name=loja-teste_outcome-sales_20260901" \
  -d "objective=OUTCOME_SALES" \
  -d "status=PAUSED" \
  -d "buying_type=AUCTION" \
  -d "special_ad_categories=[]" \
  -d "$AUTH"

export CAMPAIGN_ID=<id devolvido>
```

Resposta gravada em **`campaign_created.json`**. Para conferir o que já existe na conta (leitura do
sync): `GET $G/$ACT/campaigns?fields=id,name,objective,status,effective_status,special_ad_categories&effective_status=["ACTIVE","PAUSED"]`
→ **`campaigns.json`**.

## 5. `act_<ACCOUNT_ID>/adsets` — conjunto `PAUSED`

```bash
curl -s -X POST "$G/$ACT/adsets" \
  -d "name=frio-advantage" \
  -d "campaign_id=$CAMPAIGN_ID" \
  -d "status=PAUSED" \
  -d "optimization_goal=OFFSITE_CONVERSIONS" \
  -d "billing_event=IMPRESSIONS" \
  -d 'targeting={"geo_locations":{"countries":["BR"]},"targeting_automation":{"advantage_audience":1}}' \
  -d "daily_budget=5000" \
  -d 'promoted_object={"pixel_id":"<PIXEL_ID>","custom_event_type":"PURCHASE"}' \
  -d "$AUTH"

export ADSET_ID=<id devolvido>
```

`promoted_object` só entra quando `optimization_goal=OFFSITE_CONVERSIONS` e a conta tem pixel padrão
(`createAdSet`). Resposta gravada em **`adset_created.json`**; a listagem equivalente do sync
(`fields=id,name,campaign_id,optimization_goal,billing_event,destination_type,promoted_object,status,effective_status`)
está em **`adsets.json`**.

## 6. `act_<ACCOUNT_ID>/adcreatives` — criativo

Payload montado por `buildCreativePayload()`. Imagem única:

```bash
curl -s -X POST "$G/$ACT/adcreatives" \
  -d "name=criativo-inverno-01" \
  -d "object_story_spec={\"page_id\":\"$PAGE_ID\",\"instagram_user_id\":\"$IG_USER_ID\",\"link_data\":{\"image_hash\":\"$IMAGE_HASH\",\"link\":\"https://exemplo.com.br/inverno\",\"message\":\"Texto principal\",\"name\":\"Título\",\"description\":\"Descrição\",\"call_to_action\":{\"type\":\"SHOP_NOW\",\"value\":{\"link\":\"https://exemplo.com.br/inverno\"}}}}" \
  -d 'degrees_of_freedom_spec={"creative_features_spec":{"standard_enhancements":{"enroll_status":"OPT_OUT"}}}' \
  --data-urlencode "url_tags=utm_source=facebook&utm_medium=paid" \
  -d "$AUTH"

export CREATIVE_ID=<id devolvido>
```

Vídeo único troca `link_data` por
`video_data: { video_id, image_hash (thumb), title, message, link_description, call_to_action }`.
Carrossel usa `link_data.child_attachments` (2 a 10 cartões, `CAROUSEL_CARDS`).
Resposta gravada em **`creative_created.json`**.

## 7. `act_<ACCOUNT_ID>/ads` — anúncio `PAUSED`

```bash
curl -s -X POST "$G/$ACT/ads" \
  -d "name=loja-teste_outcome-sales_20260901_inverno-01_single-image_v1" \
  -d "adset_id=$ADSET_ID" \
  -d "creative={\"creative_id\":\"$CREATIVE_ID\"}" \
  -d "status=PAUSED" \
  -d "$AUTH"

export AD_ID=<id devolvido>
```

Resposta gravada em **`ad_created.json`**.

Confirme no Ads Manager que campanha, conjunto e anúncio estão pausados
(`https://adsmanager.facebook.com/adsmanager/manage/ads?act=<ACCOUNT_ID>` — o mesmo link que
`adsManagerUrl()` monta). **É esta tela que o screencast do App Review precisa mostrar.**

## 8. Status de revisão em batch

Como o poller faz (`getAdsStatus`, até `GRAPH_BATCH_MAX` = 50 IDs por requisição):

```bash
curl -s -X POST "$G/" \
  -d 'batch=[{"method":"GET","relative_url":"<AD_ID_1>?fields=effective_status,configured_status,ad_review_feedback"},{"method":"GET","relative_url":"<AD_ID_2>?fields=effective_status,configured_status,ad_review_feedback"}]' \
  -d "include_headers=false" \
  -d "$AUTH"
```

Resposta gravada em **`ads_status_batch.json`**.

## 9. Arquivamento (obrigatório no fim do spike)

```bash
curl -s -X POST "$G/$AD_ID"       -d "status=ARCHIVED" -d "$AUTH"
curl -s -X POST "$G/$CAMPAIGN_ID" -d "status=ARCHIVED" -d "$AUTH"
```

Mesmas chamadas de `archiveAd()` e `archiveCampaign()`, usadas por `pnpm smoke:sandbox`
(`scripts/smoke-sandbox.ts`), que cria dois anúncios pausados na conta de teste e arquiva tudo —
inclusive quando dá erro no meio.

## Erros a provocar de propósito

Para regravar as fixtures de erro, force cada caso e salve a resposta:

| Como provocar | Fixture |
|---|---|
| usar um token revogado | `error_190.json` |
| disparar chamadas até estourar o limite da conta | `error_613.json` |
| subir uma imagem 300×300 | `error_100_1487207.json` |
| criar campanha com objetivo legado (ex.: `CONVERSIONS`) direto no curl | `error_2635.json` |
| resposta 5xx da Meta (não reproduzível sob demanda — copie de um incidente real) | `error_500.json` |

O mapa completo de tradução está em `docs/erros-meta.md`.

## Mapa fixture → chamada

Arquivos reais em `packages/meta-client/test/fixtures/`, todos usados por
`packages/meta-client/test/{read,write,errors}.test.ts` via o helper `fixture()`
(`packages/meta-client/test/helpers.ts`):

| Fixture | Chamada do spike | Passo |
|---|---|---|
| `me.json` | `GET /me?fields=id,name` | 1 |
| `owned_ad_accounts.json` | `GET /<BUSINESS_ID>/owned_ad_accounts` | 1 |
| `owned_pages.json` | `GET /<BUSINESS_ID>/owned_pages` | 1 |
| `owned_instagram_accounts.json` | `GET /<BUSINESS_ID>/owned_instagram_accounts` | 1 |
| `adspixels.json` | `GET act_<ACCOUNT_ID>/adspixels` | 1 |
| `promote_pages.json` | `GET act_<ACCOUNT_ID>/promote_pages` | 1 |
| `adimages.json` | `POST act_<ACCOUNT_ID>/adimages` | 2 |
| `advideos_start.json` | `POST act_<ACCOUNT_ID>/advideos` (`upload_phase=start`) | 3.1 |
| `advideos_transfer.json` | `POST act_<ACCOUNT_ID>/advideos` (`upload_phase=transfer`) | 3.2 |
| `advideos_finish.json` | `POST act_<ACCOUNT_ID>/advideos` (`upload_phase=finish`) | 3.3 |
| `video_status_processing.json` | `GET /<VIDEO_ID>?fields=status` (ainda processando) | 3.4 |
| `video_status_ready.json` | `GET /<VIDEO_ID>?fields=status` (pronto) | 3.4 |
| `campaign_created.json` | `POST act_<ACCOUNT_ID>/campaigns` | 4 |
| `campaigns.json` | `GET act_<ACCOUNT_ID>/campaigns` | 4 |
| `adset_created.json` | `POST act_<ACCOUNT_ID>/adsets` | 5 |
| `adsets.json` | `GET act_<ACCOUNT_ID>/adsets` | 5 |
| `creative_created.json` | `POST act_<ACCOUNT_ID>/adcreatives` | 6 |
| `ad_created.json` | `POST act_<ACCOUNT_ID>/ads` | 7 |
| `ads_status_batch.json` | `POST /` (batch de status) | 8 |
| `error_190.json`, `error_613.json`, `error_500.json`, `error_2635.json`, `error_100_1487207.json` | respostas de erro | — |

## Como regravar uma fixture

1. Rode o `curl` correspondente com o token da conta de teste.
2. **Anonimize**: troque IDs reais pelos padrões já usados nas fixtures (conta `act_1030000000001`,
   página `100000000000001`, IG `17841400000000001`, campanha `238500000000000xx`), remova
   `access_token`, `appsecret_proof`, `fbtrace_id` real e qualquer URL assinada de CDN.
3. Salve com `JSON.stringify(json, null, 2)` (2 espaços, `\n` no fim) em
   `packages/meta-client/test/fixtures/<nome>.json`.
4. Rode `pnpm vitest run packages/meta-client` e ajuste o teste se o contrato mudou de verdade —
   nunca ajuste a fixture só para o teste passar.
5. Se algum campo novo passou a ser necessário, atualize também `docs/migracao-v26.md`.
