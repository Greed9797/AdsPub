# AdPub — tudo o que precisa para usar de verdade

## 1. Resumo executivo

Para sair da interface local e publicar anúncios reais, precisamos de:

1. **Google Workspace + projeto no Google Cloud + cliente OAuth Web** para login da equipe.
2. **Business Portfolio/Business Manager da Meta + app com Marketing API + System User**, com acesso às contas de anúncios e páginas reais.
3. **Conta de anúncios habilitada**, forma de pagamento válida, página do Facebook e, quando utilizado, Instagram profissional vinculado.
4. **Conta na API da Anthropic**, faturamento/créditos e acesso aos modelos configurados.
5. **Servidor com Docker Compose**, web, API, worker, PostgreSQL, Redis e armazenamento de mídia S3/MinIO.
6. **HTTPS para o app e o storage**, segredos protegidos, migrações aplicadas e backup.
7. **Configuração interna** de clientes, contas, identidades, limites, mídia e destino dos anúncios.
8. **Teste real controlado em conta autorizada**, antes de liberar a operação diária.

**Opcionais:** Google Drive para importar pastas, Telegram para alertas, MCP para usar pelo ChatGPT, GitHub/GHCR para automatizar deploy e OpenTelemetry para rastros.

**Não precisa contratar Supabase, Firebase, OpenAI, n8n ou uma API de geração de imagem para o fluxo atual.** O stack já usa PostgreSQL, Redis, S3/MinIO e Anthropic. A mídia é enviada/importada; planejar anúncios por IA não significa gerar fotos ou vídeos.

> Segurança: não cole tokens ou chaves neste documento, no Git ou em mensagens. Configure pelo ambiente seguro do servidor ou pela tela apropriada. Este guia não executa deploy nem autoriza gastos.

## 2. O que está comprovado e o que falta comprovar

### Comprovado nesta implementação local

- Redesign e temas claro, escuro e sistema implementados.
- TypeScript, ESLint, build de produção e sete jornadas de navegador passaram.
- Jornadas incluem criação, revisão e publicação usando **Meta e IA simuladas**.
- Confirmação de publicação verifica aviso de cobrança, cancelamento e confirmação.

### Ainda não comprovado por esses testes

- Credenciais atuais do servidor de produção, saldo Anthropic ou permissões reais da Meta.
- Login Google real com a configuração final da empresa.
- Publicação real de imagem, vídeo e carrossel com esta versão do código.
- Insights reais e acesso a contas de clientes compartilhadas com a BM.
- Deploy do redesign no endereço público.

O histórico em `HANDOFF.md` registra um servidor previamente publicado e credenciais externas pendentes. **Esse histórico não é uma inspeção atual do servidor.** Não assumir que continuam faltando exatamente seis valores, nem que a versão local já está em produção.

Endereços registrados no projeto, sujeitos a confirmação antes do deploy:

- App: `https://adpub.179-198-104-210.sslip.io`
- Storage: `https://adpub-s3.179-198-104-210.sslip.io`
- Ambiente no servidor: `/opt/adpub/.env.prod`
- Código no servidor: `/opt/adpub/app`

## 3. Contas, apps e serviços

| Item | Obrigatoriedade | O que obter | Onde configurar |
|---|---|---|---|
| Google Workspace | Domínio corporativo da equipe | Domínio corporativo e usuários | `AUTH_ALLOWED_DOMAIN` |
| Google Drive API + service account | Opcional (importação de criativos) | JSON da conta de serviço e pasta compartilhada | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| Business Portfolio da Meta | Obrigatório para Meta real | Business ID, ativos e responsáveis | Meta Business Settings e Conexões Meta |
| App Meta com Marketing API | Obrigatório | App ID e App Secret | `META_APP_ID`, `META_APP_SECRET` |
| System User da Meta | Obrigatório no fluxo implementado | Token e atribuição dos ativos | Tela Conexões Meta |
| Conta de anúncios | Obrigatório para publicar | ID `act_...`, acesso e faturamento | Sincronização e padrões da conta |
| Página do Facebook | Obrigatório para identidade do anúncio | ID e permissão de anunciar | Padrões da conta / editor |
| Instagram profissional | Conforme identidade e posicionamentos | Conta vinculada e permissões | Padrões da conta / editor |
| Pixel/dataset | Conforme objetivo de conversão | ID e acesso ao ativo | Padrões da conta e configuração do conjunto |
| Anthropic API | Exigida no ambiente atual; usada pela IA | API key, faturamento e modelos acessíveis | `ANTHROPIC_API_KEY` e modelos |
| PostgreSQL + Redis | Obrigatórios | Banco persistente e filas | Compose / URLs internas |
| S3/MinIO | Obrigatório | Bucket, credenciais e endpoint acessível | Compose / configuração S3 |
| Servidor + HTTPS | Obrigatório para produção | Docker, volumes, proxy e DNS | Infraestrutura |
| Telegram | Opcional, recomendado | Bot token e chat ID | Ambiente |
| ChatGPT/cliente MCP | Opcional | Cliente compatível e autorização do usuário | Endpoint `/mcp` |
| GitHub + GHCR | Opcional | Repositório, registry e secrets de deploy | GitHub Actions |
| OpenTelemetry | Opcional | Collector OTLP | `OTEL_EXPORTER_OTLP_ENDPOINT` |

## 4. Login: senha da equipe

Não há OAuth: o login é e-mail + senha (scrypt, mínimo 12 caracteres) e o erro é
sempre genérico. `AUTH_ALLOWED_DOMAIN` continua sendo a barreira de domínio.

### Preparação

1. Escolher o domínio corporativo aceito, por exemplo `suaempresa.com.br`.
2. Preencher `AUTH_SECRET` e `AUTH_ALLOWED_DOMAIN` no servidor.
3. Garantir que `WEB_URL` corresponda ao domínio público. No compose de produção ela é derivada de `APP_DOMAIN`.
4. Com o banco migrado e vazio, criar o admin inicial via bootstrap
   (`POST /api/v1/auth/password/bootstrap` com `x-adpub-login-secret`) — a rota
   desliga sozinha (404) quando já existe senha. O mesmo formulário aparece em
   `/login` como **Primeiro acesso** enquanto não houver senha.
5. Testar login com um usuário autorizado e rejeição de usuário fora do domínio
   (resposta genérica, sem dizer se o e-mail existe).

### Restrições importantes

- A senha mínima tem 12 caracteres; tentativas repetidas por e-mail + IP caem em `429`.
- O bootstrap só existe antes da primeira senha: depois, novos usuários nascem em **Usuários** (admin).
- Os demais usuários e acessos por conta são administrados em **Usuários**.
- Não usar `DEV_NO_AUTH` ou credenciais de demonstração como solução de produção.
- Trocar o domínio do site exige ajustar `WEB_URL`/`APP_DOMAIN`, proxy e `AUTH_ALLOWED_DOMAIN`.

## 5. Meta: app, token e ativos

Portais:

- Apps: <https://developers.facebook.com/apps/>
- Configurações do negócio: <https://business.facebook.com/settings/>
- Gerenciador de anúncios: <https://adsmanager.facebook.com/>

Os nomes das opções e exigências de aprovação podem variar no painel. A lista abaixo descreve o que esta implementação precisa, não uma garantia de aprovação da Meta.

### 5.1 Negócio e app

- Negócio sob controle da empresa, com administrador disponível.
- App configurado para o uso da Marketing API e associado ao negócio correto.
- App ID e App Secret obtidos do mesmo app usado para gerar o token.
- `META_APP_ID` e `META_APP_SECRET` no ambiente de API/worker.
- Verificar requisitos de verificação empresarial, acesso avançado e App Review para os ativos/público pretendidos.
- Preparar URLs públicas de privacidade e instruções de exclusão de dados, contatos e demais campos solicitados pela Meta. O repositório não prova que essas páginas já estejam publicadas.
- O cliente envia `appsecret_proof`; manter a política de exigência de App Secret coerente com isso.

### 5.2 System User e permissões

Criar o System User no negócio, atribuir o app e os ativos necessários e gerar o token pelo app correto. O código registra estas quatro permissões:

| Permissão | Uso previsto |
|---|---|
| `ads_management` | Criar campanha, conjunto, criativo e anúncio; consultar status |
| `business_management` | Consultar inventário de contas e ativos do negócio |
| `pages_read_engagement` | Consultar página/identidade vinculada |
| `pages_manage_ads` | Anunciar em nome da página |

**O registro dessas permissões no banco não comprova que o token realmente as recebeu.** Conferir token, atribuição dos ativos e resultado de chamadas reais. Permissão no app e acesso ao ativo são exigências diferentes.

O token do System User:

- Entra em **Conexões Meta → Criar conexão**, junto do Business ID e nome da conexão.
- **Não é uma variável `META_ACCESS_TOKEN` do ambiente normal.**
- É cifrado no banco usando `MASTER_KEY`.
- Deve ser tratado como revogável: mudança de segurança, expiração ou revogação exigem atualização na conexão.
- Nunca deve aparecer em screenshot, log, planilha de onboarding ou repositório.

### 5.3 Ativos necessários por conta

- Conta de anúncios real, ativa e sem bloqueio impeditivo.
- System User com permissão suficiente nessa conta.
- Meio de pagamento e limites de faturamento revisados pelo responsável.
- Página do Facebook acessível e autorizada para publicidade.
- Instagram profissional vinculado e atribuído quando for usado.
- Pixel/dataset e evento de conversão adequados quando exigidos pelo objetivo.
- URL de destino real, acessível e permitida nas regras do cliente.
- Direitos de uso sobre mídia, marca e conteúdo.
- Orçamento, público, região, objetivo e otimização definidos antes da publicação.

**Contas compartilhadas por clientes:** a matriz do projeto ainda marca esse cenário como não validado. Testar a sincronização com uma conta real compartilhada antes de prometer operação em todas as BMs. Se ela não aparecer, investigar propriedade/compartilhamento e endpoints; não resolver inventando IDs.

### 5.4 Tier e versão

- O exemplo e o schema usam `META_API_VERSION=v25.0` como configuração do projeto; isso não comprova disponibilidade atual em todas as contas. Validar suporte e plano de migração antes do piloto.
- `META_TIER=limited` e `full` são opções internas que controlam concorrência.
- **Alterar a variável para `full` não concede permissão nem aprovação na Meta.** Só ajustar após acesso efetivo confirmado.
- O tier observado na conexão e o configurado no ambiente devem ser conferidos.

### 5.5 Publicar não é ativar veiculação

O código cria novos anúncios com `status: PAUSED`. Novas campanhas e conjuntos também são criados pausados. Usar uma campanha/conjunto já existente não significa que o sistema vai pausar esse ativo existente.

Fluxo seguro:

1. Preparar, revisar e validar no AdPub.
2. Confirmar criação/publicação na Meta.
3. Abrir o link do anúncio no Ads Manager e conferir status, identidade, mídia, destino e orçamento.
4. Ativar veiculação no Ads Manager somente por decisão do responsável.

**A veiculação pode gerar cobrança.** Teto de quantidade de anúncios no AdPub não é teto financeiro nem substitui orçamento/limite de gastos na Meta.

## 6. Anthropic: geração, análise e classificação

Portal: <https://console.anthropic.com/>

Necessário:

- Organização/conta com acesso à API, faturamento/créditos e limites adequados.
- Chave de API para o ambiente de produção.
- Acesso aos IDs de modelo realmente configurados.
- Teste de uma geração pequena e de uma análise antes do uso em lote.

Variáveis atuais:

| Variável | Configuração no código | Ação |
|---|---|---|
| `ANTHROPIC_API_KEY` | Obrigatória no schema | Inserir chave real, protegida |
| `AI_MODEL_GENERATION` | Padrão `claude-sonnet-4-6` | Confirmar acesso e ID no provedor |
| `AI_MODEL_CLASSIFY` | Padrão `claude-haiku-4-6` | Confirmar existência/acesso; não assumir que o default funciona |
| `AI_PLAN_TIMEOUT_MS` | Padrão 40000 ms | Ajustar somente após diagnosticar latência real |

Assinatura do Claude no navegador **não substitui credencial e faturamento da API**.

Os IDs acima são valores encontrados no repositório, não modelos validados nesta conta Anthropic. Se precisar trocar um modelo, atualizar também a tabela de custos em `packages/config/src/constants.ts`; o fallback de preço pode distorcer o custo exibido.

### O modo manual dispensa Anthropic?

Ele dispensa a geração inicial de textos por IA, mas **não torna a instalação atual independente de Anthropic**: o schema de API/worker exige `ANTHROPIC_API_KEY`, e recursos de análise/validação podem usar IA. Não preencher uma chave falsa para chamar isso de produção pronta.

### Limitação de áudio

O worker usa explicitamente `unavailableTranscriber('sem provedor de transcrição aprovado')`. Portanto:

- A análise pode trabalhar com evidência visual e declarar ausência de transcrição.
- **Não prometer entendimento completo da fala/áudio.**
- Não há variável pronta de Deepgram, Whisper ou outro provedor que resolva isso sozinha.
- Transcrição real exige escolher, integrar e testar um provedor em uma tarefa de implementação separada.

## 7. Infraestrutura obrigatória

### Serviços

| Serviço | Responsabilidade | Efeito se parar |
|---|---|---|
| `web` | Interface Next.js e login | Usuários não acessam o produto |
| `api` | Regras, dados e criação de jobs | Operações da interface falham |
| `worker` | Publicação, importação e análise em background | Jobs podem permanecer na fila |
| `postgres` | Clientes, contas, lotes, usuários e histórico | Produto perde acesso aos dados |
| `redis` | Filas BullMQ | Publicações/análises não avançam |
| `minio` ou S3 compatível | Arquivos, vídeos e imagens | Upload/prévia/processamento falham |
| `migrate` | Atualização do schema | Versão nova pode não funcionar |
| `minio-init` | Criação inicial do bucket no stack MinIO | Bucket ausente impede upload |
| `mcp` | Acesso por cliente MCP | Só integração MCP indisponível |

O compose fornecido inclui MCP, embora ele não seja necessário para usar a interface web.

### Servidor e rede

- Docker Engine e Docker Compose, volumes persistentes e capacidade livre para os serviços.
- O compose atual reserva limites de memória que somam aproximadamente 5 GiB; dimensionar o host também para sistema operacional, picos, disco e outros serviços. Isso não é um benchmark de capacidade.
- Disco monitorado: vídeos, imagens, banco e backups crescem com uso.
- App e storage com DNS e certificados HTTPS válidos.
- Saída de rede para Google, Meta, Anthropic e, se usados, Drive/Telegram.
- PostgreSQL, Redis e API não expostos diretamente à internet.
- FFmpeg/ffprobe disponíveis nas imagens usadas para processamento de vídeo; validar imagem real implantada.
- Links assinados de mídia devem abrir no navegador; bucket não precisa ser público.

**Particularidade deste servidor:** o compose depende de uma rede de proxy externa (`mcrm_internal` por padrão) e do Caddy de outro stack. Ele não instala um proxy independente. Em outro VPS, é necessário adaptar essa topologia; apenas executar o compose não cria o HTTPS.

Não duplicar blocos no Caddy nem disputar portas 80/443 com os sistemas vizinhos.

## 8. Configuração completa do ambiente

Usar `infra/.env.prod.example` como base para produção, armazenando o arquivo real fora do Git. `.env.example` é referência de desenvolvimento; suas senhas demonstrativas não servem para produção.

### Valores que a operação precisa preencher

| Grupo | Variáveis |
|---|---|
| Domínios | `APP_DOMAIN`, `S3_DOMAIN` — hosts sem `https://` |
| Proxy | `PROXY_NETWORK` |
| Imagens | `IMAGE_PREFIX`, `IMAGE_TAG` — versão conhecida, preferencialmente tag imutável |
| Banco | `POSTGRES_PASSWORD` |
| MinIO | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_BUCKET`, `S3_REGION` |
| Cifra | `MASTER_KEY` — exatamente 32 bytes codificados em base64 |
| Sessões | `AUTH_SECRET`, `AUTH_ALLOWED_DOMAIN` |
| Meta | `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION`, `META_TIER` |
| Anthropic | `ANTHROPIC_API_KEY`, `AI_MODEL_GENERATION`, `AI_MODEL_CLASSIFY` |
| Recursos | `FEATURE_AI_ANALYSIS`, `FEATURE_REPORTS`, `FEATURE_INSIGHTS` — `1` ou `0` |
| Operação | `LOG_LEVEL`; `AI_PLAN_TIMEOUT_MS` se necessário |

### Valores derivados pelo compose ou necessários fora dele

`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `API_URL` e `WEB_URL` são montados no compose com os valores acima. Fora dessa topologia, precisam apontar para os serviços corretos.

- `API_PORT` é 4000 por padrão.
- `META_BASE_URL` deve usar a Graph real em produção; não deixar URL de fake-graph do teste.
- `NODE_ENV` deve ser `production` no runtime de produção.
- `MCP_PUBLIC_URL`, `MCP_ALLOWED_HOSTS` e `MCP_PORT` pertencem ao MCP; no compose, a URL pública deriva do domínio e o serviço usa a porta padrão 4100.
- Configurações e secrets comuns precisam ser coerentes entre serviços, especialmente `AUTH_SECRET` e `MASTER_KEY`.

### Opcionais

- `GOOGLE_SERVICE_ACCOUNT_JSON`: somente para Drive.
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`: os dois juntos, ou nenhum.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: omitir quando não utilizado; string vazia falha na validação de URL.

### Geração e proteção

Para uma instalação nova, gerar segredos aleatórios localmente no ambiente seguro:

```bash
openssl rand -base64 32  # MASTER_KEY
openssl rand -hex 32    # AUTH_SECRET
openssl rand -hex 24    # uma senha; repetir separadamente para banco e MinIO
```

**Não executar como rotação automática de uma instalação existente.** Trocar `MASTER_KEY` sem migração torna tokens já cifrados ilegíveis; trocar `AUTH_SECRET` invalida autenticações assinadas com o segredo anterior. Guardar backup seguro dos segredos separado do banco. Proteger `.env.prod` com permissão `600`.

## 9. Integrações opcionais

### Google Drive

1. Habilitar Google Drive API no projeto Google Cloud escolhido.
2. Criar uma conta de serviço e obter seu JSON de credenciais de forma segura.
3. Compartilhar a pasta de mídia com o e-mail da conta de serviço, com acesso de leitura.
4. Configurar `GOOGLE_SERVICE_ACCOUNT_JSON` como JSON ou base64, conforme o loader existente.
5. Importar uma pasta pequena pela Biblioteca de mídia e conferir arquivos/rejeições.

O código usa `https://www.googleapis.com/auth/drive.readonly`. Não conceder acesso administrativo amplo só para importar uma pasta. Políticas de compartilhamento do Workspace/Shared Drive podem exigir liberação do administrador.

Sem essa configuração, **upload direto continua sendo o caminho de mídia**; importação Drive retorna erro explícito.

### Telegram

- Criar bot em `@BotFather`.
- Escolher destinatário/grupo e obter `chat_id`.
- Configurar token e chat ID juntos.
- Enviar e conferir um alerta de teste autorizado.
- Sem integração, conferir logs do worker; não presumir que a equipe receberá notificações externas.

### MCP / ChatGPT

- Implantar serviço `mcp`, migrações OAuth e rotas do proxy.
- Usar `https://SEU_DOMINIO/mcp` em um cliente que suporte conexão MCP remota com OAuth.
- Autorizar com usuário real do AdPub e escopo mínimo necessário.
- Leitura: `adpub:read`; escrita: `adpub:write`, conforme fluxo de consentimento implementado.
- Disponibilidade desse recurso no ChatGPT depende do produto/plano/política do workspace do usuário; não é condição para usar o AdPub pelo navegador.
- Não colar token da Meta no ChatGPT para contornar o consentimento.

Detalhes: [MCP](mcp.md).

### GitHub/GHCR e observabilidade

GitHub/GHCR automatiza entrega, mas não é uma dependência para operar anúncios. Para CI/deploy, conferir `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_PORT` e `GHCR_PAT` conforme workflow e registry privado. Publicação do repositório e execução de deploy exigem autorização separada.

OpenTelemetry exige um collector compatível e endpoint válido. Não é necessário contratar Sentry; o ambiente atual não o exige.

## 10. Ordem recomendada de ativação

### Etapa A — acesso e credenciais

- [ ] Definir responsável técnico e responsável pelos gastos na Meta.
- [ ] Confirmar domínio corporativo, domínio do app e domínio do storage.
- [ ] Configurar app Meta, System User e uma conta de teste autorizada.
- [ ] Confirmar faturamento e acesso aos modelos na API Anthropic.
- [ ] Preencher ambiente real sem valores de demonstração.

### Etapa B — implantação técnica

- [ ] Fazer backup do banco, mídia e segredos existentes antes de atualizar.
- [ ] Conferir versão das imagens que contêm o redesign e código atual.
- [ ] Aplicar todas as migrações dessa versão, não apenas números anotados em handoffs antigos.
- [ ] Conferir bucket e acesso por links assinados.
- [ ] Aplicar/revisar rotas HTTPS no proxy sem afetar vizinhos.
- [ ] Fazer login real com o admin do bootstrap; conferir papel e escopos dos demais usuários.

A execução do deploy deve seguir [Deploy](deploy.md), com aprovação do ambiente/alvo. O script local `tmp/dev-up.sh` não é instalador de produção e não é versionado.

### Etapa C — cadastro operacional

1. Em **Clientes**, criar cliente real: nome, regras, tom de voz, termos proibidos, domínios de destino, UTMs e nomenclatura.
2. Em **Conexões Meta**, cadastrar conexão real com Business ID e token do System User.
3. Usar **Testar** e **Sincronizar**; conferir se vieram as contas e ativos esperados.
4. Em **Editar padrões**, vincular conta ao cliente, definir página, Instagram/pixel quando aplicável e teto diário de quantidade de anúncios.
5. Em **Usuários**, atribuir papéis e escopo de contas; evitar todos como admin.
6. Na **Biblioteca de mídia**, selecionar cliente, enviar mídia e conferir prévia/validação.
7. Separar orçamento, destino e identidade corretos para o primeiro lote.

Não reutilizar `act_demo`, BM Demo ou Demo Store como se fossem ativos reais. Não apagar dados de um banco compartilhado para remover demonstrações; separar ambientes e revisar os registros antes de qualquer exclusão.

### Etapa D — primeira publicação controlada

- [ ] Criar lote pequeno, inicialmente com uma imagem aprovada e conteúdo real.
- [ ] Conferir cliente, conta, página, objetivo, orçamento, público, destino e UTMs.
- [ ] Se usar IA, conferir texto gerado e pendências; IA não equivale a aprovação humana.
- [ ] Validar lote e resolver bloqueios, sem ignorar avisos relevantes.
- [ ] Confirmar a quantidade e a conta no diálogo de publicação.
- [ ] Acompanhar worker até conclusão ou erro explícito.
- [ ] Abrir link no Ads Manager e conferir anúncio **pausado**, mídia, identidade e URL.
- [ ] Repetir o teste para vídeo e carrossel se esses formatos fizerem parte da operação.
- [ ] Só então decidir sobre ativação e verba na Meta.

O smoke real do repositório pede `SMOKE_META_TOKEN`, `SMOKE_BUSINESS_ID` e `SMOKE_AD_ACCOUNT_ID`. **Não rodar `pnpm smoke:sandbox` ou `pnpm smoke:integration` contra o banco operacional:** esses scripts têm rotinas destrutivas de preparação. Usar banco descartável, Redis isolado e conta Meta de teste autorizada. O smoke real cria recursos externos e precisa de autorização explícita.

### Etapa E — liberar equipe

- [ ] Testar acesso de um gestor com escopo restrito.
- [ ] Confirmar tratamento de falha, token inválido e jobs sem worker.
- [ ] Conferir alertas, logs, backup e restauração em ambiente isolado.
- [ ] Registrar procedimento de renovar token e responsável por credenciais.
- [ ] Rodar piloto pequeno antes de ampliar para todas as contas.

## 11. Diagnóstico rápido

| Sintoma | Conferir primeiro |
| Login com senha falha | `AUTH_SECRET`, `AUTH_ALLOWED_DOMAIN`, senha (12+) e throttle (429 após 10 falhas) |
| Login funciona, acesso negado | Papel do usuário e escopo da conta; não ampliar acesso indiscriminadamente |
| App abre mas ações falham | API saudável, ambiente validado, migrações e sessão |
| Conexão Meta falha | App/token correspondentes, permissões, revogação, Business ID e ativos atribuídos |
| Conta do cliente não aparece | Propriedade versus compartilhamento e acesso do System User; cenário ainda precisa de prova real |
| Mídia enviada mas sem prévia | Endpoint S3 público correto, HTTPS, bucket, assinatura e objeto existente |
| Vídeo rejeitado | Mensagem de validação e codec; arquivo tocar no browser não garante aceitação pela Meta |
| Job fica na fila | Worker ativo, Redis correto, logs e banco do mesmo ambiente |
| IA retorna 401/403 | API key, organização, saldo e acesso ao modelo |
| IA retorna modelo inexistente | ID exato de modelo no provedor; defaults do projeto não são prova de disponibilidade |
| Análise não entende fala | Transcritor não integrado no estado atual; não é só configuração |
| Publicação bloqueada | Identidade, destino, mídia, orçamento, política e relatório de validação |
| Publicado mas sem gasto/entrega | Anúncio novo nasce pausado; revisar e ativar conscientemente no Ads Manager |
| Performance sem dados | Permissões, período e origem; Insights real ainda exige validação em conta autorizada |

## 12. Custos que precisam de responsável

- **Mídia paga:** orçamento e cobrança da Meta, quando houver veiculação.
- **IA:** uso da API Anthropic por tokens/requisições, separado de assinatura de chat.
- **Infra:** servidor, disco, backups e eventual tráfego de storage.
- **Identidade:** licenças Workspace, se a empresa ainda não tiver.
- **Opcionais:** planos de cliente MCP, observabilidade e outras ferramentas escolhidas.

Não há valor mensal fechado comprovado por este guia. Definir limites por provedor, monitorar uso e não confundir limite diário de anúncios com limite de dinheiro.

## 13. O que você precisa providenciar agora

Preencher apenas informações não secretas neste checklist; segredos vão direto para o ambiente seguro:
- [ ] Domínio corporativo aceito e e-mail de quem será admin.
- [ ] Projeto Google Cloud responsável (só para o Drive, opcional) — login não usa OAuth.
- [ ] Domínio definitivo do app e storage, ou decisão de manter os endereços existentes no piloto.
- [ ] Business ID da Meta e nome do negócio responsável.
- [ ] App ID e confirmação de que App Secret/token estão guardados com segurança.
- [ ] ID da primeira conta real de teste, página e Instagram/pixel quando aplicável.
- [ ] Confirmação de permissões e acesso do System User aos ativos.
- [ ] Conta Anthropic com faturamento e modelos validados.
- [ ] Cliente, mídia, landing page e orçamento do primeiro lote.
- [ ] Decisão sobre Drive, Telegram e MCP — nenhum deles bloqueia uso básico pela web.
- [ ] Autorização específica para configurar/deployar no servidor e executar teste na conta Meta indicada.

**Pronto para uso real** significa: login real + mídia acessível + conta/ativos sincronizados + IA real quando usada + worker funcionando + anúncio criado e conferido na Meta + backup operacional. A interface abrir e os testes simulados passarem não substituem esse aceite.

## 14. Fontes e escopo deste guia

Guia baseado no código e configuração desta cópia do repositório. Não houve leitura de segredos reais, alteração de servidor, chamada paga ou auditoria autenticada dos painéis externos para produzi-lo. Nomes de menus, modelos disponíveis e exigências de revisão dos provedores devem ser confirmados nas contas da empresa durante a configuração.

Fontes técnicas:

- [Schema de ambiente](../packages/config/src/env.ts)
- [Ambiente de produção de exemplo](../infra/.env.prod.example)
- [Contrato de login com senha](../packages/auth/src/password.ts)
- [Cadastro de conexões Meta](../apps/api/src/services/connections.ts)
- [Escritas Meta e status PAUSED](../packages/meta-client/src/write/index.ts)
- [Importação Drive](../apps/worker/src/drive/import.ts)
- [Análise e ausência de transcritor](../apps/worker/src/analysis/run.ts)
- [Credenciais externas](credenciais-externas.md)
- [App Review Meta](meta-app-review.md)
- [Capacidades e limites de evidência](capability-matrix.md)
- [Deploy](deploy.md), [restauração](restore.md) e [piloto](piloto-e-rollout.md)
