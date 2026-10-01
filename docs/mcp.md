# Servidor MCP (Grok, ChatGPT, Claude)

O AdPub publica um **servidor MCP remoto** em `https://APP_DOMAIN/mcp`, no mesmo host do app. Um
único endpoint; **três connectors** (Grok, OpenAI/ChatGPT, Claude) se cadastram sozinhos via OAuth.
Cada um lê clientes, contas, lotes, métricas e auditoria. Com o escopo de publicação marcado,
cria lote, gera plano, valida e publica anúncios.

Quem age é **o usuário que consentiu**: cada chamada de ferramenta assina uma sessão dessa pessoa,
então a API aplica os papéis dela e a auditoria registra o nome dela, não um serviço.

## 1. Conectar os três

URL local (default `MCP_PORT`): `http://localhost:4100/mcp`
URL pública (depois do MCP no host): `https://adpub.179-198-104-210.sslip.io/mcp`

Na tela de consentimento, **consultar** já entra; **publicar anúncios** é um checkbox desmarcado (gasta verba).
Marque se o bot for subir lote. Viewer nunca recebe write.

Configs no repositório (apontam para o MCP local):

| Cliente | Arquivo | Onde ligar |
|---|---|---|
| Grok no Cursor | `.cursor/mcp.json` | Settings → Tools & MCP → Connect no `adpub` |
| Grok (CLI / grok.com) | `.grok/config.toml` | `grok mcp add` ou grok.com → Connectors → Custom |
| Claude | `.mcp.json` | Claude Code lê o arquivo; claude.ai → Customize → Connectors |
| ChatGPT | (sem arquivo) | Settings → Connectors (developer mode) → URL pública |

Grok.com, ChatGPT e claude.ai exigem **HTTPS público** — localhost não alcança. Até o MCP subir
no host, use Cursor/Claude Code/Grok CLI contra `:4100` (ou `MCP_PORT` se a 4100 estiver ocupada).

### ChatGPT

1. Developer mode → **Configurações → Connectors → Create**.
2. URL: `https://APP_DOMAIN/mcp` (sem barra no fim).
3. O ChatGPT busca `/.well-known/oauth-protected-resource/mcp`, se registra sozinho
   e abre o consentimento do AdPub.
4. Login no AdPub no mesmo navegador. Marque **publicar anúncios** para subir lote;
   deixe desmarcado para só consultar.

### Claude

1. **claude.ai** → Customize → Connectors → custom → a mesma URL pública.
2. **Claude Code** (esta pasta): já tem `.mcp.json`. Reinicie o Code e autorize no browser.
3. Callbacks aceitos: `https://claude.ai/api/mcp/auth_callback` e `https://claude.com/api/mcp/auth_callback`.

### Grok

1. **Cursor (este bot):** `.cursor/mcp.json` aponta para `:4100`. Tools & MCP → Connect.
2. **Grok CLI:** `.grok/config.toml` na raiz. `grok mcp add --transport http adpub http://localhost:4100/mcp`.
3. **grok.com:** Connectors → New → Custom → URL pública HTTPS depois do deploy do MCP.

Para cortar o acesso: desconecte o connector (chama `/revoke`) ou apague as linhas de
`oauth_tokens` do usuário no banco.

O MCP Inspector e o Cursor desktop também valem em `http://localhost:8787/callback`.

## 2. Ferramentas

Todas falam com a **API** (`/api/v1/...`). Os caminhos da tabela são relativos a esse prefixo
(o cliente do MCP monta a URL). WhatsApp usa as rotas `/whatsapp-accounts`.

| Ferramenta | Endpoint da API | Escopo |
|---|---|---|
| `listar_clientes` | `GET /clients` | leitura |
| `listar_contas` | `GET /ad-accounts` | leitura |
| `saude_das_contas` | `GET /health/accounts` | leitura |
| `listar_criativos` | `GET /assets` | leitura |
| `listar_lotes` | `GET /batches` | leitura |
| `ver_lote` | `GET /batches/:id` | leitura |
| `performance_da_conta` | `GET /performance` | leitura |
| `aprendizados_do_cliente` | `GET /learnings` | leitura |
| `auditoria` | `GET /audit` | leitura (admin/coordinator) |
| `criar_lote` | `POST /batches` | publicação |
| `gerar_plano_do_lote` | `POST /batches/:id/plan` | publicação (custa IA) |
| `validar_lote` | `POST /batches/:id/validate` | publicação |
| `publicar_lote` | `POST /batches/:id/publish` | publicação (gasta verba) |
| `listar_whatsapp` | `GET /whatsapp-accounts` | leitura |
| `listar_templates_whatsapp` | `GET /whatsapp-accounts/:id/templates` | leitura |
| `criar_template_whatsapp` | `POST /whatsapp-accounts/:id/templates` | publicação |
| `enviar_template_whatsapp` | `POST /whatsapp-accounts/:id/messages` | publicação |

`publicar_lote` exige `confirm_count` — a quantidade de itens que o usuário confirmou no chat — e a
API recusa se não bater com o lote. `enviar_template_whatsapp` exige `confirm_to` idêntico ao
telefone de destino; a API recusa leitor e não chama a Meta se a confirmação não bater. O token da
conta não volta no JSON. As ferramentas de escrita ficam indisponíveis (mensagem `isError`, sem
chamada à API) quando a conexão não tem o escopo de publicação.

O servidor beta da Meta (`mcp.facebook.com/whatsapp_business_tools`) não entra neste conector. Quem
quiser usá-lo adiciona o endpoint à parte, com o OAuth da própria Meta.

## 3. Autorização (por que é caseira)

O SDK MCP v2 congelou os helpers de *authorization server*; a recomendação oficial é usar um IdP
dedicado. Não vale trazer um IdP só para isso: quem autentica é o login Google do AdPub (sessão
`adpub_session`), e o MCP só precisa **emitir tokens para si mesmo**. Então `apps/mcp` implementa o
lado servidor:

- `GET /.well-known/oauth-protected-resource[/mcp]` — metadados do recurso (RFC 9728), apontados
  pelo `WWW-Authenticate` de qualquer `401`.
- `GET /.well-known/oauth-authorization-server` — metadados do authorization server (RFC 8414).
- `POST /register` — registro dinâmico (RFC 7591), só `https` (ou `http` em localhost).
- `GET|POST /authorize` — tela de consentimento; exige sessão do AdPub e traz o aviso de gasto.
- `POST /token` — `authorization_code` com **PKCE S256** obrigatório e `refresh_token` rotativo.
- `POST /revoke` — revogação (RFC 7009).

Decisões que valem saber:

- **Tokens opacos** (`adpub_mcp_...`), guardados só como SHA-256. Acesso de 1 h, refresh de 30 dias.
- **Refresh rotativo com detecção de replay**: reapresentar um refresh já trocado derruba a corrente
  inteira (`family_id`) — quem tinha o token roubado perde acesso e o dono reconecta.
- **`iss` na resposta de autorização** e conferência de `resource` (RFC 8707) contra a URL pública.
- **Códigos de uso único** (`consumed_at` marcado num `UPDATE` condicional, sem corrida).
- **CSRF** na tela de consentimento: o `POST` carrega um HMAC dos parâmetros (renova a cada pedido) e
  o cookie de sessão é `SameSite=Lax`.
- **Sem segredo de cliente**: os clientes são públicos (`token_endpoint_auth_method: none`) e o PKCE
  é o que amarra o código a quem começou o fluxo.
- **DNS rebinding**: o app valida `Host` e `Origin` contra a lista de hosts permitidos.

Tabelas (migration `0012`): `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`.

## 4. Configuração

| Variável | Para quê |
|---|---|
| `MCP_PUBLIC_URL` | URL pública do endpoint (`https://APP_DOMAIN/mcp`). Dela saem issuer, resource e metadados. |
| `MCP_PORT` | Porta interna (padrão 4100). |
| `MCP_ALLOWED_HOSTS` | Hosts aceitos no header `Host` (lista separada por vírgula). Vazio = só o host da URL pública; `localhost`/`127.0.0.1` sempre valem para o healthcheck. |
| `DATABASE_URL`, `AUTH_SECRET`, `API_URL` | Iguais aos da API; o MCP lê as tabelas OAuth e assina a sessão de quem consentiu. |

Em produção nada disso é preenchido à mão: o serviço `mcp` do `docker-compose.prod.yml` deriva tudo
de `APP_DOMAIN`.

## 5. Rodar local

```bash
# no .env local (tmp/dev-logs/dev.env):
MCP_PORT=4100
MCP_PUBLIC_URL=http://localhost:4100/mcp

pnpm --filter @adpub/mcp dev     # sobe em http://localhost:4100/mcp
curl -s localhost:4100/.well-known/oauth-protected-resource/mcp | jq
```

Se a 4100 estiver ocupada por outro stack da máquina, troque as duas variáveis
juntas (`MCP_PORT=4410` + `MCP_PUBLIC_URL=http://localhost:4410/mcp`): o issuer
sai da URL pública, e um `resource` que não bate com ela é recusado no
consentimento. Em produção a porta é só interna ao compose — não muda nada.

O fluxo completo (registro dinâmico → consentimento → PKCE → tokens → ferramenta → refresh →
revogação) tem teste de integração contra um banco descartável:

```bash
pnpm exec vitest run apps/mcp/test/oauth-flow.test.ts
```

Ele cria/migra o banco `adpub_mcp_test` em `E2E_POSTGRES_BASE_URL` (padrão
`postgres://adpub:adpub@127.0.0.1:55432`, a porta da infra local) e não chama a Meta nem a API de
verdade — o `fetch` da API é substituído por um duplo.

## 6. Produção: rotas e verificação

O Caddy do stack `mcrm` encaminha `/mcp`, `/.well-known/oauth-*`, `/authorize`, `/token`,
`/register` e `/revoke` para `adpub-mcp:4100`; o resto continua indo para `adpub-web:3000`
(`infra/Caddyfile.snippet`).

Se o host já tinha o bloco do AdPub no `/opt/mcrm/Caddyfile` (deploy anterior), **substitua o bloco
inteiro** pelo novo snippet — não acrescente outro, dois sites para o mesmo host e o Caddy recusa:

```bash
sudo cp /opt/mcrm/Caddyfile /opt/mcrm/Caddyfile.bak.adpub.$(date +%F)
# edite /opt/mcrm/Caddyfile trocando o bloco adpub.* pelo conteúdo novo de /opt/adpub/Caddyfile.snippet
docker exec mcrm-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Verificação:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://APP_DOMAIN/.well-known/oauth-protected-resource/mcp   # 200
curl -fsS https://APP_DOMAIN/.well-known/oauth-authorization-server | jq '.token_endpoint'
curl -isS https://APP_DOMAIN/mcp -H 'accept: application/json' | head -3   # 401 + WWW-Authenticate
cd /opt/adpub && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T mcp \
  node -e "fetch('http://127.0.0.1:4100/health').then(r=>r.text()).then(console.log)"
```

## 7. Limites conhecidos

- Só leitura + criação/publicação de lote: editar item, duplicar lote, relatórios de análise e
  importação de CSV ainda não têm ferramenta.
- `auditoria` e `painel operacional` dependem do papel do usuário (admin/coordinator); com papel
  menor, a API responde 403 e a ferramenta devolve o erro em texto.
- Listas são cortadas em 50 itens (100 para criativos) com um aviso no resultado.
