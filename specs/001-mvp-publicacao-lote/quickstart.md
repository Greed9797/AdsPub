# Quickstart — feature 001

## 1. Pré-requisitos na Meta (fazer na semana 1)
1. **App Meta** (tipo Business) com o produto *Marketing API* adicionado. Anotar `APP_ID` e `APP_SECRET`. Ativar "Exigir App Secret" nas configurações avançadas.
2. **Business Verification** da BM concluída (ou iniciada).
3. **System User** (admin) na BM → atribuir todas as contas de anúncio, páginas e IGs → gerar token com `ads_management`, `business_management`, `pages_read_engagement`, `pages_manage_ads`.
4. **Conta de teste**: criar uma conta de anúncio de sandbox ou usar uma conta real com orçamento zero (tudo nasce `PAUSED`).
5. **App Review** → *Marketing API Access Tier* → solicitar **Full access** com screencast do spike (criar anúncio pausado via API). Enquanto não sair, o app fica no tier Limited (dev).

## 2. Google
- Conta de serviço no Workspace com Drive API habilitada; compartilhar as pastas de criativos com o e-mail da conta de serviço (leitura).
- OAuth client (Auth.js) restrito ao domínio da empresa.

## 3. Subir local
```bash
pnpm install
cp .env.example .env         # preencher variáveis abaixo
docker compose -f infra/docker-compose.yml up -d   # postgres, redis, minio
pnpm db:migrate
pnpm dev                     # web :3000, api :4000, worker
```

### Variáveis obrigatórias
```
DATABASE_URL=postgres://...
REDIS_URL=redis://localhost:6379
S3_ENDPOINT= S3_BUCKET= S3_ACCESS_KEY= S3_SECRET_KEY=
MASTER_KEY=<32 bytes base64>            # cifra de tokens (fora do banco!)
META_APP_ID= META_APP_SECRET=
META_API_VERSION=v25.0
META_TIER=limited                        # limited|full — ajusta concorrência
GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= AUTH_ALLOWED_DOMAIN=empresa.com.br
GOOGLE_SERVICE_ACCOUNT_JSON=<base64>
ANTHROPIC_API_KEY=
AI_MODEL_GENERATION=<modelo Sonnet atual> AI_MODEL_CLASSIFY=<modelo Haiku atual>
SLACK_WEBHOOK_URL=                       # alertas (opcional)
```

## 4. Fumaça manual (jornada crítica)
1. Login com e-mail corporativo → `/contas` → **Nova conexão** → colar token do System User → ver "Conectado · tier limited".
2. **Sincronizar** → conta de teste aparece → definir página, IG e pixel padrão.
3. `/clientes` → criar "Cliente Teste" com perfil de voz e template `{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}`.
4. `/biblioteca` → importar pasta do Drive com 3 imagens (1:1, 4:5, 9:16) e 1 vídeo 9:16 ≤ 60 s.
5. `/lotes/novo` → modo IA → colar o briefing abaixo → **Gerar plano**.
6. Revisar a grade, editar uma copy, **Validar** → **Publicar (pausado)**.
7. Acompanhar até `published`; conferir no Ads Manager que campanha, conjunto e anúncios existem, `PAUSED`, com os nomes corretos.
8. Forçar um erro (trocar link por domínio não permitido em um item) → validar → confirmar bloqueio; corrigir → reprocessar só aquele.

### Briefing de exemplo
```
Cliente: Loja Teste. Conta: act_XXXX.
Objetivo: vendas no site (pixel padrão da conta).
Oferta: 20% OFF na coleção de inverno até sexta, cupom INVERNO20.
Público: 1 conjunto frio (Advantage+ audience) e 1 conjunto quente (envolvidos 30d).
Criativos: usar os 4 da pasta "Inverno – Semana 2".
CTA: Comprar agora. Link: https://lojateste.com.br/inverno
Tom: direto, urgência leve, sem prometer resultado. Não usar "barato".
3 variações de copy por criativo.
```

## 5. Testes
```bash
pnpm test              # unit + contrato (fixtures gravadas)
pnpm test:e2e          # Playwright — jornadas 1, 3 e 5 com Meta mockada
pnpm smoke:sandbox     # cria e depois arquiva 2 anúncios na conta de teste (exige token)
```
