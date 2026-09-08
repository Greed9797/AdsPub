# Mapa de erros da Meta traduzidos (T097)

> **Fonte da verdade**: `packages/meta-client/src/errors.ts`.
> A tabela abaixo foi gerada a partir de `translationTable()` (mapa `TRANSLATIONS`) combinada
> com `classify()` e com os conjuntos `TRANSIENT_CODES`, `AUTH_CODES` e `RATE_LIMIT_CODES`.
> Ao mexer no `errors.ts`, atualize este documento no mesmo commit.

## Como um erro vira mensagem de gestor

1. `MetaClient.request()` (`packages/meta-client/src/client.ts`) detecta `error` no corpo ou HTTP
   fora da faixa 2xx e lança `MetaApiError`.
2. O construtor de `MetaApiError` chama:
   - `classify(code, subcode, httpStatus)` → `auth` | `transient` | `permanent`;
   - `translate(code, subcode, { userMsg, message })` → `{ title, action }` em português.
3. O pipeline (`apps/worker/src/publish/pipeline.ts`, função `handleFailure`) usa
   `isTransientError()` para decidir entre reagendar e falhar, e grava
   `MetaApiError.toDraftError(step)` em `ad_drafts.error`
   (`{ code, subcode, message, translated, action, step }`).
4. A UI mostra `translated` + `action`; a mensagem original da Meta (`message`) fica em "detalhes"
   (Constituição VII).

### Ordem de decisão do `classify()`

| Condição (na ordem em que é avaliada) | Classe |
|---|---|
| `code` ∈ `AUTH_CODES` = `{190, 102, 463, 467}` | `auth` |
| `code` ∈ `TRANSIENT_CODES` = `{1, 2, 4, 17, 32, 613, 80004}` | `transient` |
| `httpStatus >= 500` | `transient` |
| sem `code` e sem `httpStatus` (rede caiu) | `transient` |
| qualquer outro caso (inclui subcódigos `1487xxx`) | `permanent` |

`RATE_LIMIT_CODES` = `{4, 17, 32, 613, 80004}` não muda a classe (todos já são transientes):
serve para `MetaApiError.isRateLimit`, que a UI usa para explicar a espera.

## O que o pipeline faz em cada classe

| Classe | Efeito no item (`ad_drafts`) | Efeito no job (`publish_jobs`) | Efeito na conta / conexão |
|---|---|---|---|
| `transient` | fica na etapa atual (`uploading_media`, `ensuring_campaign`, …); nada é perdido, porque cada ID já retornado foi persistido antes | `state = 'delayed'`; BullMQ reprocessa com backoff exponencial `RETRY.baseDelayMs` 2 s → dobra a cada tentativa → teto `RETRY.maxDelayMs` 5 min, até `RETRY.maxAttempts` = 6 tentativas | nenhum, salvo o efeito de rate limit abaixo |
| `transient` **de rate limit** | idem acima | idem acima | os headers de uso (`X-Business-Use-Case-Usage`, `X-App-Usage`, `X-Ad-Account-Usage`) são lidos a cada chamada; a partir de `RATE_LIMIT_THROTTLE_PERCENT` = 75 % a conta recebe `paused_until` (`persistUsage` em `apps/worker/src/meta.ts`) pelo `estimated_time_to_regain_access` informado pela Meta, ou por 1 min quando ela não informa nada (`pauseDurationMs`, chamado com tentativa 1). Enquanto pausada, `runPublish` lança `AccountPausedError` e o job espera o fim da pausa. Alerta `warning` "Rate limit próximo do teto" |
| `auth` | vai para `failed` com o erro traduzido (`auth` não é transiente) | `state = 'failed'` | `handleAuthFailure`: conexão vira `needs_attention` com `last_error`, **todas** as contas da conexão ficam pausadas por 1 h e sai alerta `critical` "Token da BM inválido" |
| `permanent` | vai para `failed`; o lote continua (Constituição III) e o item pode ser reprocessado por `POST /api/v1/batches/:id/items/:itemId/retry`, retomando da etapa salva | `state = 'failed'` | se mais de 20 % dos itens do lote falharem, sai alerta `warning` "Lote com muitas falhas" |

Duas exceções internas não são erro da Meta e reagendam mais rápido, sem consumir a lógica acima
(`publishBackoff` em `apps/worker/src/index.ts`):

| Exceção | Origem | Reagendamento |
|---|---|---|
| `VideoNotReadyError` | vídeo ainda em `processing` na Meta (`apps/worker/src/publish/media.ts`) | a cada `VIDEO_POLL_INTERVAL_MS` = 15 s, até `VIDEO_READY_TIMEOUT_MS` = 20 min |
| `RefPendingError` | outra thread está criando a mesma campanha/conjunto do lote (`apps/worker/src/publish/refs.ts`) | 2 s |
| `AccountPausedError` | conta com `paused_until` no futuro | espera até o fim da pausa (mínimo 5 s) |

## Tabela de tradução

Chaves com `/` são `código/subcódigo` e têm prioridade sobre a chave só de código
(`translate()` procura `code/subcode` antes de `code`).

| Código | Classe | Mensagem ao usuário (`title`) | Ação recomendada (`action`) | O que o pipeline faz |
|---|---|---|---|---|
| `1` | transiente | A Meta teve um erro temporário ao processar o pedido. | O item será reprocessado automaticamente. | Retry com backoff (2 s → 5 min, 6 tentativas) |
| `2` | transiente | Serviço da Meta indisponível no momento. | O item será reprocessado automaticamente em alguns minutos. | Retry com backoff |
| `4` | transiente (rate limit) | Limite de chamadas do aplicativo atingido. | A fila desta conta ficará pausada até o limite liberar. | Retry com backoff + pausa da fila da conta quando o uso passa de 75 % |
| `17` | transiente (rate limit) | Limite de chamadas do usuário atingido. | A fila desta conta ficará pausada até o limite liberar. | Retry com backoff + pausa da fila da conta |
| `32` | transiente (rate limit) | Limite de chamadas da página atingido. | A fila desta conta ficará pausada até o limite liberar. | Retry com backoff + pausa da fila da conta |
| `613` | transiente (rate limit) | Limite de chamadas da conta de anúncio atingido. | A fila desta conta fica pausada pelo tempo informado pela Meta. | Retry com backoff + pausa por `estimated_time_to_regain_access` |
| `80004` | transiente (rate limit) | Limite de chamadas de anúncios atingido para esta conta. | A fila desta conta fica pausada até o limite liberar. | Retry com backoff + pausa da fila da conta |
| `100` | permanente | A Meta recusou um parâmetro do anúncio. | Revise os campos do item; o detalhe original está em "detalhes". | Item → `failed`; lote segue; reprocessável após correção |
| `190` | auth | Token do System User inválido ou expirado. | Gere um novo token na BM e atualize a conexão em Contas. | Item → `failed`; conexão → `needs_attention`; contas da conexão pausadas por 1 h; alerta crítico |
| `200` | permanente | O System User não tem permissão para esta ação nesta conta. | Confira na BM se a conta, a página e o Instagram estão atribuídos ao System User. | Item → `failed` |
| `272` | permanente | Sem permissão para usar esta página no anúncio. | Atribua a página ao System User na Business Manager. | Item → `failed` |
| `2635` | permanente | Este tipo de campanha foi descontinuado pela Meta. | Use objetivos OUTCOME_* no fluxo unificado Advantage+. | Item → `failed` (o produto já bloqueia objetivos não `OUTCOME_*` em `createCampaign`, FR-020) |
| `100/1487194` | permanente | A imagem não pôde ser processada pela Meta. | Reexporte o arquivo em JPG/PNG dentro das proporções aceitas e importe de novo. | Item → `failed` |
| `100/1487207` | permanente | A imagem é menor que o mínimo aceito. | Reexporte com pelo menos 600 px em cada lado — ex.: 1080×1350. | Item → `failed` |
| `100/1487390` | permanente | A copy tem termos que a Meta reprova. | Reescreva o texto seguindo os avisos de política. | Item → `failed` |
| `100/1487748` | permanente | A conta de anúncio não pode publicar agora. | Verifique pagamento/limite de gastos da conta no Ads Manager. | Item → `failed` |
| `100/1885183` | permanente | O criativo é incompatível com o posicionamento escolhido. | Ajuste a proporção do criativo ou o posicionamento do conjunto. | Item → `failed` |
| `100/2490408` | permanente | A URL de destino foi recusada. | Confirme o domínio verificado e o link informado. | Item → `failed` |

São 18 entradas em `TRANSLATIONS` — o mesmo número que `translationTable()` devolve.

### Códigos classificados sem tradução própria

`AUTH_CODES` tem quatro códigos, mas só o `190` está em `TRANSLATIONS`. Os outros três caem no
fallback de `translate()` e usam o texto que a própria Meta mandou:

| Código | Classe | Mensagem exibida | Ação exibida |
|---|---|---|---|
| `102` | auth | `error_user_msg` ou `message` da resposta; se vierem vazios, "Erro não mapeado da Meta." | Abra "detalhes" para ver a resposta original da Meta. |
| `463` | auth | idem | idem |
| `467` | auth | idem | idem |

O mesmo fallback vale para qualquer código fora da tabela. Regra prática: se um código aparecer
com frequência em `meta_api_calls.error_code`, ele merece uma entrada em `TRANSLATIONS`.

### Erros sem corpo da Meta

| Situação | Classe | O que acontece |
|---|---|---|
| `MetaTimeoutError` (60 s por padrão no `MetaClient`) | transiente | Retry com backoff |
| HTTP 5xx sem `code` | transiente | Retry com backoff |
| `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `socket hang up` | transiente (`isTransientError`) | Retry com backoff |
| Erro do próprio produto (ex.: "Criativo de imagem sem image_hash.") | permanente | Item → `failed` com `translated` = "Falha ao publicar o anúncio." e ação "Veja os detalhes e reprocesse o item." |

## Fixtures de erro usadas nos testes

`packages/meta-client/test/fixtures/`:

| Arquivo | Código / subcódigo | Serve para provar |
|---|---|---|
| `error_190.json` | 190 / 463 | classificação `auth` e tradução do token expirado |
| `error_613.json` | 613 / 1487742 | rate limit da conta de anúncio |
| `error_500.json` | 2 | erro transiente genérico da Meta |
| `error_2635.json` | 2635 | campanha legada descontinuada |
| `error_100_1487207.json` | 100 / 1487207 | prioridade da chave `código/subcódigo` sobre a chave de código |

Os testes que consomem essas fixtures estão em `packages/meta-client/test/errors.test.ts`.

## Onde ver os erros em produção

- `meta_api_calls` — toda chamada, com `endpoint`, `api_version`, `status_code`, `error_code`,
  `error_subcode`, `latency_ms` e `usage` (Constituição VI).
- `ad_drafts.error` — o erro traduzido do item, exibido na tela do lote.
- `publish_jobs.last_error` — o erro da tentativa, com a flag `transient`.
- `/saude` (web) e `GET /api/v1/health/accounts` — taxa de erro da última hora e P95 de latência
  por conta.
