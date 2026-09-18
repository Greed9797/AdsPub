# Credenciais externas — criar, colar e aplicar

O `.env.prod` de produção fica em `/opt/adpub/.env.prod` (só no servidor, `chmod 600`) e hoje tem
**5 `TROCAR`**: Meta, Anthropic e os segredos locais. O login é e-mail + senha (sem OAuth):
o primeiro acesso cria o admin via bootstrap e os demais usuários nascem em `/usuarios`.

O host onde o produto está publicado é `179.198.104.210` e o endereço público é
`https://adpub.179-198-104-210.sslip.io` (quando houver domínio próprio, ele entra em `APP_DOMAIN`,
no `infra/Caddyfile.snippet` e no `/opt/mcrm/Caddyfile` — ver `docs/deploy.md` §1).

## 0. Onde cada valor entra

| Variável | Onde se cria | Para que serve no produto |
|---|---|---|
| `AUTH_ALLOWED_DOMAIN` | não se cria | domínio corporativo aceito no login com senha e no bootstrap |
| `AUTH_SECRET` | `openssl rand -hex 32` | assina a sessão e o segredo interno do login/bootstrap |
| `META_APP_ID` / `META_APP_SECRET` | painel de apps da Meta | assina `appsecret_proof` e identifica o app no App Review |
| `ANTHROPIC_API_KEY` | console da Anthropic | geração de copy/variantes e análise |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (opcional) | @BotFather | alertas de token inválido, rate limit e lote com falhas |
| token do System User (Meta) | Business Manager | **não vai no `.env`**: entra cifrado pela tela `/contas` |

O que **não** entra no `.env.prod`: token da BM, nada de `AUTH_SECRET`/`MASTER_KEY` (já gerados no
host — trocar o `MASTER_KEY` invalida os tokens já cifrados).

## 1. Login — senha e primeiro acesso

Não há OAuth: a senha (scrypt, mínimo 12 caracteres) mora em `users.password_hash` e
o erro do login é sempre genérico (`401` idêntico para e-mail desconhecido, inativo ou
senha errada). Tentativas repetidas por e-mail + IP caem em `429` (10 falhas / 10 min).

1. Confira `AUTH_ALLOWED_DOMAIN` no servidor (ex.: `w3bsite.com.br`): só esse domínio
   entra, no bootstrap e na criação de usuários.
2. Com o banco migrado e vazio, crie o admin inicial:

   ```bash
   curl -s -X POST https://APP_DOMAIN/api/v1/auth/password/bootstrap \
     -H 'content-type: application/json' \
     -H "x-adpub-login-secret: $AUTH_SECRET" \
     -d '{"email":"voce@DOMINIO","name":"Seu Nome","password":"<12+ caracteres>"}'
   ```

   A rota responde 404 quando já existe qualquer senha — o desligamento é automático
   e permanente. Depois dela, entre em `/login` com e-mail + senha.
3. Os demais usuários nascem em `/usuarios` (admin): e-mail, nome, papel e senha
   temporária. Reajuste de papel, ativação/desativação e redefinição de senha ficam
   na mesma tela.

## 2. Anthropic — chave da IA

1. `console.anthropic.com` → **API keys → Create key** (nome: `adpub-producao`).
2. Copie **uma vez** (a chave não aparece de novo) e cole em `ANTHROPIC_API_KEY`.
3. Os modelos usados estão em `AI_MODEL_GENERATION` e `AI_MODEL_CLASSIFY` (`claude-sonnet-4-6` e
   `claude-haiku-4-6`). Se a sua org só tiver outros ids liberados, troque aqui — o custo por
   milhão de tokens está em `packages/config/src/constants.ts` (`AI_PRICING_USD_PER_MTOK`) e modelo
   fora da tabela cai no preço `default` (`packages/ai/src/cost.ts`), ou seja: id novo sem linha na
   tabela distorce o custo que aparece em `/ops/metrics`.

## 3. Meta — app da Marketing API

O produto funciona em **Limited** (piloto). O roteiro completo de Full access, permissões e
screencast está em `docs/meta-app-review.md` — aqui é só o que vira variável:

1. `developers.facebook.com` → **Meus apps → Criar app → tipo Business** → adicione o produto
   **Marketing API**.
2. **Configurações do app → Básico**: copie **ID do app** → `META_APP_ID` e **Chave secreta do app**
   → `META_APP_SECRET` (a chave só aparece clicando em "Mostrar").
3. **Configurações → Avançado**: ative **Exigir chave secreta do app**. O cliente já manda
   `appsecret_proof` em toda chamada (`packages/crypto/src/index.ts`), então sem isso a Meta recusa.
4. **Token do System User** (Business Manager → Usuários do sistema, com as contas de anúncio,
   páginas e contas do Instagram atribuídas): gere o token com as quatro permissões
   (`ads_management`, `business_management`, `pages_read_engagement`, `pages_manage_ads`) e cole na
   tela **`/contas`** do produto — ele é cifrado com o `MASTER_KEY` antes de ir para o banco. Guarde
   uma cópia fora do repositório; o produto nunca devolve o token.
5. Aponte o app para o domínio de produção (URL do site, política de privacidade e URL de exclusão
   de dados) — o checklist está em `docs/meta-app-review.md` §2.

## 4. Telegram — alertas operacionais (opcional, mas recomendado no piloto)

1. No Telegram, fale com **@BotFather** → `/newbot` → nome e usuário do bot → copie o token
   (`123456:AA...`) para `TELEGRAM_BOT_TOKEN`.
2. Mande qualquer mensagem para o bot e descubra o `chat_id`:

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*' | head -1
   ```

   Para um grupo, use o id negativo que aparece ali (`-100...`); o bot precisa estar no grupo.
3. Preencha os dois no `.env.prod` — **os dois juntos ou nenhum**: o schema de ambiente recusa o par
   incompleto e o boot falha (é de propósito, para não subir alerta que nunca chega).
4. Teste depois do `up -d`:

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/sendMessage" \
     -H 'content-type: application/json' \
     -d '{"chat_id":"<CHAT_ID>","text":"AdPub: alertas configurados"}'
   ```

Sem bot configurado, o alerta continua indo para o log estruturado do worker — nada se perde.

## 5. Aplicar no host

```bash
ssh w3vps
grep -n TROCAR /opt/adpub/.env.prod        # confira o que falta
nano /opt/adpub/.env.prod                  # cole os valores (arquivo é 600)
cd /opt/adpub
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d web api worker
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Só `web`, `api` e `worker` precisam reiniciar: banco, storage e bucket não mudam. Se trocar
`PROXY_NETWORK` ou domínio, aí sim é rota de Caddy (`docs/deploy.md` §3) + `up -d` completo.

### Primeiro acesso

Abra `https://adpub.179-198-104-210.sslip.io/login`. Sem nenhuma senha no banco, a
tela mostra **Primeiro acesso**: preencha nome, e-mail do domínio de
`AUTH_ALLOWED_DOMAIN` e senha (12+ caracteres) para criar o admin. Depois disso a
tela some para sempre e o login passa a ser e-mail + senha.

## 6. GitHub — CI e deploy por GHCR (opcional agora)

Hoje o deploy é `HOST=w3vps ./infra/deploy-host.sh` (constrói as imagens no host). Publicar o
repositório liga o CI de verificação e o workflow `Deploy` (imagens no GHCR + `migrate`/`up` por
SSH):

```bash
gh repo create adpub --private --source=. --remote=origin --push
```

Depois, no repositório → **Settings → Secrets and variables → Actions**:

| Nome | Tipo | Valor |
|---|---|---|
| `DEPLOY_SSH_KEY` | secret | chave privada cuja pública está no `authorized_keys` do host |
| `DEPLOY_HOST` | secret | `179.198.104.210` |
| `DEPLOY_USER` | secret | `root` (ou `deploy`, se você criar o usuário — `docs/deploy.md` §3) |
| `GHCR_PAT` | secret | PAT clássico com `read:packages` (o host não tem login no GHCR) |
| `DEPLOY_PATH` | var | `/opt/adpub` (é o padrão, dá para omitir) |

O CI (`.github/workflows/ci.yml`) roda sozinho no push; o `smoke.yml` (conta sandbox real) continua
manual, por release.

## 7. Checklist

- [ ] `/opt/adpub/.env.prod` sem nenhum `TROCAR` (`grep -c TROCAR` → 0)
- [ ] `docker compose ps` com `adpub-web`, `adpub-api`, `adpub-worker` de pé e `(healthy)`
- [ ] `https://adpub.179-198-104-210.sslip.io/login` abre e o botão do Google funciona
- [ ] primeiro usuário entrou como `admin`; os gestores entram como `manager`
- [ ] `/saude` sem conta em "Requer atenção" e `GET /ops/metrics` com filas vazias
- [ ] alerta de teste chegou no Telegram (se configurado)
