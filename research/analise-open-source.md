# Análise: o que já existe (open source e mercado) para reaproveitar

Data da análise: 08/09/2026. Verificar licenças antes de copiar código (a maioria é MIT/Apache, mas alguns são *open-core*).

## Conclusão em uma frase
Não existe um **publicador em lote com UI, multi-conta e IA** open source pronto para usar; existe muito **código de referência de qualidade** (SDKs oficiais, servidores MCP, filas) que reduz o risco técnico. A recomendação é **construir a aplicação** e **reaproveitar padrões e bibliotecas**, não fazer fork de um projeto inteiro.

---

## 1. Camada Meta (obrigatória)

### 1.1 SDKs oficiais da Meta (Business SDK)
| Projeto | Linguagem | Uso recomendado |
|---|---|---|
| `facebook/facebook-nodejs-business-sdk` (v25.0.x) | Node/TS | Referência de payloads, enums de campos (`Campaign.Fields`, `AdCreative.Fields`), `FacebookAdsApiBatch`. |
| `facebook/facebook-python-business-sdk` | Python | Mais madura em exemplos (upload de vídeo em chunks). Alternativa se a equipe preferir Python. |
| `facebook-ruby-business-sdk`, PHP, Java | — | Só como referência. |

**Veredito:** usar como **referência**. Os SDKs são autogerados, pesados, com tipagem fraca e issues antigas em batch (ex.: upload de imagem via batch falha com "Image Resize Failed" — issue #116 do SDK Node). O plano prevê um **cliente fino próprio** (`packages/meta-client`) com `fetch`, tipos zod, leitura de headers de rate limit e `appsecret_proof`, copiando os payloads dos SDKs.

### 1.2 Meta Ads AI Connectors — MCP oficial (`https://mcp.facebook.com/ads`)
- Lançado em 29/04/2026, em beta aberto; 29 ferramentas (relatórios, gestão de campanha, catálogo, diagnóstico de sinais); OAuth por usuário, sem App Review; tudo que o agente cria nasce **pausado**; rollout em fases (contas sem acesso retornam `is_ads_mcp_enabled: false`); sem rate limits publicados; existe CLI companheira.
- **Onde encaixa:** ferramenta do **copiloto (spec 002)** para "ler a conta antes de propor o lote" e para análises ad hoc dos gestores dentro do Claude. **Não** serve de espinha dorsal do pipeline: OAuth por usuário (não por System User), beta sem SLA, sem controle da nossa UI/fila/auditoria.

### 1.3 Servidores MCP da comunidade (código de referência excelente)
| Projeto | Destaques | O que copiar |
|---|---|---|
| `pipeboard-co/meta-ads-mcp` (Python) | Meta Business Partner com app aprovado; hospedado + self-host; "writes explícitos, campanhas nascem pausadas". | Modelo de segurança de escrita; cobertura de endpoints. |
| `byadsco/meta-ads-mcp` | Multi-tenant; 125 ferramentas; token cifrado AES-256-GCM em repouso; allowlist de usuários. | **Arquitetura do cofre de tokens** e multi-conta. |
| `mikusnuz/meta-ads-mcp` (Node) | 135 ferramentas cobrindo Marketing API v25/v26, incl. criativos, catálogos, upload de ativos. | Payloads de `adimages`/`advideos`/`adcreatives` em TypeScript. |
| `attainmentlabs/meta-ads-mcp` | `dry_run=True` por padrão em ações de escrita; teto de orçamento diário em env. | Padrão *dry-run* e *guardrails* de orçamento. |
| `amekala/ads-mcp` (Adspirer) | Multi-plataforma (Google, Meta, LinkedIn, TikTok); expõe REST (`/api/v1/tools/<tool>/execute`) além de MCP; skills para Claude Code. | Se um dia expandir para outras plataformas. |
| Servidores "supervisionados" (57 tools, open-core) e skills de Claude Code para Meta Ads | Safety hooks, subagentes. | Ideias de *safety gates* para o copiloto. |

**Veredito:** ler o código de 2–3 deles para calibrar payloads e erros; opcionalmente **embutir um como camada de ferramentas** do copiloto em vez de escrever ferramentas MCP do zero.

---

## 2. Orquestração, filas e jobs
| Opção | Prós | Contras | Decisão |
|---|---|---|---|
| **BullMQ + Redis** (MIT) | Simples, maduro, retries/backoff/rate-limit nativos, ótimo em Node. | Estado de workflow fica por nossa conta (máquina de estados no Postgres). | **Escolhido para o MVP.** |
| Trigger.dev (Apache-2.0, self-host) / Inngest | Workflows duráveis, retries por passo, UI de execução. | Mais uma peça de infra; lock-in de modelo de programação. | Reavaliar na Release 2 se a máquina de estados crescer. |
| Temporal | Durabilidade forte. | Pesado demais para 80–800 jobs/dia. | Não. |
| n8n (fair-code) | Zero código; nó HTTP para Graph API. | Não vira produto com UI própria, auditoria e RBAC. | Útil só para um **spike** ou automações laterais (ex.: avisar no Slack). |

## 3. Integrações auxiliares
- **Google Drive**: `googleapis` (Node) — listar pasta, baixar arquivos; a empresa já usa Workspace.
- **Validação de mídia**: `sharp` (dimensões/proporção de imagem), `ffprobe`/`fluent-ffmpeg` (duração, resolução, codec de vídeo).
- **Storage**: S3-compatível (Cloudflare R2 / Supabase Storage / MinIO). 
- **Auth**: Auth.js (Google Workspace SSO); RBAC com CASL ou políticas simples por conta.
- **IA**: SDK oficial da Anthropic em TypeScript com *tool use* / saída estruturada validada por zod (docs: https://docs.claude.com/en/api/overview). Cache por hash de entrada.
- **Observabilidade**: pino + OpenTelemetry + Sentry.

## 4. Benchmarks comerciais (não open source — só para referência de UX)
AdManage.ai, adsuploader.com, Pipeboard, Madgicx, Revealbot, Smartly. Padrões que vale copiar: **importação por planilha**, **nomenclatura por template**, **guardrails** que alertam inconsistência antes de publicar, **status por item** com link para o Ads Manager.

## 5. Alternativa nativa (fallback)
O Ads Manager tem **importação/exportação em massa por Excel**. Não tem IA nem auditoria, mas serve como plano B enquanto o App Review não sai e como referência de colunas que os gestores já conhecem.

## 6. Fatos da plataforma que condicionam o desenho (fontes: docs Meta, atualizadas em maio/2026)
1. **Tiers**: "Ads Management Standard Access" virou **Marketing API Access Tier** — *Limited* (padrão, para desenvolvimento, sem gestão de BM) e *Full* (após App Review); limiar para Full reduzido de 1 500 para **500 chamadas em 15 dias**.
2. **Rate limit por conta/hora** (`ads_management`): Full = 100 000 + 40 × anúncios ativos; Limited = 300 + 40 × ativos. Headers `X-Business-Use-Case-Usage` e `X-Ad-Account-Usage` trazem uso e `estimated_time_to_regain_access`.
3. **Versão**: v25.0 corrente; v23.0 encerrada em jun/2026; v26.0 esperada ~set/2026. Especificar a versão em toda chamada.
4. **Advantage+**: criação/atualização de campanhas legadas ASC/AAC bloqueada em **todas** as versões desde 19/05/2026 ("Automation Unification").
5. **Batch**: até 50 requisições; não pode incluir vários conjuntos da mesma campanha no mesmo batch.

## 7. Recomendação final
| Camada | Decisão |
|---|---|
| Aplicação web + API + workers | **Construir** (TypeScript, Next.js, BullMQ, Postgres). |
| Cliente Meta | **Construir fino**, copiando payloads dos SDKs/MCPs. |
| Cofre de tokens | **Copiar padrão** de `byadsco/meta-ads-mcp` (AES-256-GCM, chave fora do banco). |
| Copiloto IA | **Construir** prompts próprios; ferramentas de leitura via MCP oficial (Release 2). |
| Relatórios/insights | **Não construir** — MCP oficial / BI existente. |
