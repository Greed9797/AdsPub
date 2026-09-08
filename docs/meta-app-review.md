# App Review — Marketing API Full Access (T008)

Checklist para tirar o app do tier **Limited** (Development) e chegar ao **Full** (Standard) da
Marketing API. O produto funciona no tier Limited — o pipeline publica normalmente —, mas o rollout
às 17 contas depende do Full access (ver `specs/001-mvp-publicacao-lote/tasks.md`, nota de T008).

## 1. O que muda no produto entre Limited e Full

| Item | Limited | Full |
|---|---|---|
| `META_TIER` (`.env`, validado em `packages/config/src/env.ts` como `limited \| full`, padrão `limited`) | `limited` | `full` |
| `CONCURRENCY_BY_TIER` (`packages/config/src/constants.ts`) | `1` job de publicação por vez | `3` jobs simultâneos |
| Worker (`apps/worker/src/index.ts`) | `concurrency: 1` e `limiter: { max: 1, duration: 1000 }` | `concurrency: 3` e `limiter: { max: 3, duration: 1000 }` |
| `decideConcurrency()` (`packages/meta-client/src/rate-limit.ts`) | base 1 | base 3, caindo para 1 acima de `RATE_LIMIT_THROTTLE_PERCENT` = 75 % de uso |
| Volume prático | suficiente para a conta de teste e o piloto | necessário para ~80 anúncios/dia nas 17 contas |

Nada além da concorrência muda: as chamadas, os campos e a máquina de estados são idênticos nos dois
tiers. O tier **observado** (o que a Meta devolve nos headers `ads_api_access_tier`) é lido por
`parseUsageHeaders()` e gravado em `meta_connections.api_tier`; aparece na tela `/contas` e o tier
**configurado** aparece em `GET /api/v1/health` (`meta_tier`).

Depois que o Full access sair: mudar `META_TIER=full` no ambiente, reiniciar o worker e conferir na
linha de log `worker pronto` que `publishConcurrency` virou 3.

## 2. Pré-requisitos antes de submeter

- [ ] App Meta do tipo **Business** com o produto **Marketing API** adicionado.
- [ ] "Exigir App Secret" ativado nas configurações avançadas do app (o cliente já manda
      `appsecret_proof` em toda chamada — `packages/crypto/src/index.ts`, `appsecretProof()`).
- [ ] **Business Verification** da BM concluída (é pré-requisito do Full access, não do Limited).
- [ ] **System User** admin criado na BM, com todas as contas de anúncio, páginas e contas do
      Instagram atribuídas.
- [ ] Token do System User gerado com as quatro permissões da tabela abaixo e guardado **fora do
      repositório** (no produto ele entra cifrado, `MASTER_KEY` fora do banco).
- [ ] Spike do `docs/spike-meta.md` executado com sucesso na conta de teste (é o material do
      screencast).
- [ ] Política de privacidade e termos publicados em URL pública, preenchidos no app.
- [ ] Ícone do app e categoria preenchidos (o formulário trava sem isso).

## 3. Permissões a solicitar

| Permissão | Por que o AdPub precisa | Onde aparece no código |
|---|---|---|
| `ads_management` | criar campanha, conjunto, criativo e anúncio (sempre `PAUSED`) e ler status de revisão | `packages/meta-client/src/write/index.ts`, `packages/meta-client/src/read/index.ts` (`getAdsStatus`) |
| `business_management` | listar contas de anúncio, páginas, contas do Instagram e pixels da BM para o gestor não digitar ID | `listOwnedAdAccounts`, `listPages`, `listIgAccounts`, `listPixels` |
| `pages_read_engagement` | ler a página e o Instagram vinculado que serão usados no `object_story_spec` | `listAccountPages` (`act_<id>/promote_pages`) |
| `pages_manage_ads` | anunciar em nome da página | `createAdCreative` / `createAd` |

As quatro permissões são exatamente as gravadas em `meta_connections.scopes`
(`apps/api/src/services/connections.ts`).

## 4. Roteiro do screencast

Duração alvo: 3 a 5 min, sem cortes, em inglês (ou com legenda em inglês), gravado na conta de teste.
Precisa aparecer, nesta ordem:

1. **Identificação** — nome do app na tela do painel de desenvolvedor e o App ID visível.
2. **Contexto** — a tela `/contas` do AdPub mostrando a conexão da BM: label, tier e status
   "Conectado". Deixe claro que é uma ferramenta interna, usada só pela própria equipe, para as
   contas da própria BM.
3. **Permissão `business_management`** — clicar em **Sincronizar** e mostrar contas, páginas, IGs e
   pixels aparecendo na tela (nenhum ID digitado à mão).
4. **Permissão `ads_management` (escrita)** — montar um lote em `/lotes/novo`, validar e clicar
   **Publicar (pausado)**; mostrar os itens avançando pelas etapas até `published`.
5. **Prova de que nasce pausado** — abrir o Ads Manager pela própria interface e mostrar campanha,
   conjunto e anúncio com status **Paused**. Este é o ponto que o revisor procura.
6. **Permissões de página** — mostrar no criativo publicado que a página e o Instagram usados são os
   da BM.
7. **Limpeza** — arquivar o anúncio e a campanha criados (passo 9 do `docs/spike-meta.md`).
8. **Sem segredo em tela** — nenhum token, App Secret ou `access_token` de URL pode aparecer; o
   AdPub mascara tokens (`mask()` em `packages/crypto`), mas confira o terminal e a barra de
   endereço antes de gravar.

Alternativa quando a UI não estiver disponível: gravar a sequência de `curl` do `docs/spike-meta.md`
com o token redigido em tela.

## 5. Campos do formulário de submissão

| Campo | O que preencher |
|---|---|
| **App type / Use case** | Business → Marketing API → Ads Management |
| **Tier solicitado** | Standard / Full access |
| **How will you use this permission?** | Uma resposta por permissão, com a justificativa da tabela da §3, deixando explícito: ferramenta interna, contas da própria BM, sem acesso de terceiros, tudo criado `PAUSED` e ativado só por decisão humana |
| **Step-by-step instructions to test** | Os 8 passos do roteiro do screencast, com a URL do ambiente de teste e um usuário de teste do domínio corporativo |
| **Test credentials** | Usuário de teste (e-mail do domínio configurado em `AUTH_ALLOWED_DOMAIN`) e senha temporária — nunca o token do System User |
| **Screencast** | Vídeo da §4 (link não listado ou upload direto) |
| **Platform / URL** | URL do ambiente onde o revisor pode testar (`WEB_URL`) |
| **Privacy policy URL / Terms URL** | URLs públicas do app |
| **Data handling** | Não coletamos dados de consumidor final; guardamos apenas nome e e-mail corporativo dos colaboradores (`memory/constitution.md`, "Dados pessoais") |

## 6. Registro da submissão

Preencher a cada envio/resposta da Meta. Uma linha por submissão (reenvio depois de rejeição também
vira linha nova).

| Data de submissão | Protocolo / ID da submissão | Permissões solicitadas | Status | Tier atual | Resposta da Meta / próxima ação |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

Legenda de **Status**: `preparando` · `submetido` · `em análise` · `mais informações` · `aprovado` ·
`rejeitado`.
Legenda de **Tier atual**: `limited` (development) · `full` (standard) — precisa bater com o
`META_TIER` do ambiente.

### Registro da Business Verification

| Data de início | Documentos enviados | Status | Conclusão |
|---|---|---|---|
|  |  |  |  |

## 7. Se for rejeitado

1. Ler o motivo exato no painel — a maioria das rejeições é "não deu para reproduzir" ou
   "screencast não mostra a permissão em uso".
2. Regravar o trecho específico do roteiro que faltou (§4) — não refazer o vídeo inteiro sem
   necessidade.
3. Confirmar que o usuário de teste ainda funciona e que o ambiente está no ar.
4. Reenviar e registrar nova linha na tabela da §6.
5. Enquanto isso, seguir em `META_TIER=limited`: o piloto de 2 gestores e 3 contas
   (`docs/piloto-e-rollout.md`) cabe folgado em concorrência 1.
