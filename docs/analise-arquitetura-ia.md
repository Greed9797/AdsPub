# Análise de arquitetura, qualidade de IA, velocidade e custo

Data: 2026-09-12. Status: proposta para decisão, não implementação aprovada.

## Veredito

Manter o monorepo e a stack atual. O primeiro investimento deve ser corrigir contexto, cache e medição de custo; depois isolar processamento pesado da API e avaliar roteamento de modelos. Não há evidência para justificar microserviços, banco vetorial, fine-tuning ou troca de fornecedor agora.

O sistema já tem separação entre sugestão e publicação, validação determinística, cache, aprendizado versionado e infraestrutura de filas. O problema principal encontrado é a integração incompleta dessas peças: a geração de lote não recebe a análise visual, o contexto de copy omite informações da marca, o cache pode devolver resultados de outro contexto/modelo e o total operacional não cobre todos os gastos de IA.

Melhorar o modelo sem corrigir isso pode apenas tornar mais cara uma resposta baseada em informação incompleta.

## Escopo e limites da análise

Inspeção direcionada de `packages/ai`, `creative-intel`, `storage`, persistência de gerações/custos, serviços de planejamento, validação, análise, relatórios, aprendizados, processamento do worker e compose de produção. Evidências de arquivo e linha abaixo se referem ao código lido nesta análise.

Foram executados experimentos locais importando o código TypeScript real, com invoker controlado e sem rede. Esses experimentos verificam contratos e fluxos, não a qualidade linguística de um modelo real.

Não consultei banco de produção, faturas, credenciais, métricas de tráfego ou p95 real. Não fiz chamadas pagas de IA, deploy ou alteração de código funcional. Não há base para prometer percentual de economia ou melhora de conversão.

`.specs/STATE.md` e `.specs/` não existem neste workspace. As restrições efetivas estão em `memory/constitution.md`; o projeto usa `specs/`. Este documento não cria uma segunda estrutura de especificações nem declara fases de implementação concluídas.

## 1. Arquitetura atual e o que preservar

Fluxos observados:

- Web Next.js/BFF → API Fastify → serviços → Postgres e Anthropic.
- Planejamento: contexto do cliente/conta/criativos → `AiClient.generatePlan` → normalização → persistência de rascunhos.
- Análise de conteúdo: API → leitura do original no storage → ffmpeg → invoker multimodal → análise persistida.
- Relatório: métricas determinísticas + análises → snapshot → invoker → validação de relatório → persistência.
- Publicação: API enfileira → BullMQ/worker → protocolo de publicação Meta. IA não publica diretamente.
- Redis/BullMQ e Postgres já existem. MinIO armazena os arquivos. Compose compartilha host e proxy com outros sistemas.

Preservar:

| Base | Evidência | Motivo |
|---|---|---|
| IA produz dados, ativação humana e padrão PAUSED | `memory/constitution.md:10` | Qualidade criativa não deve remover barreiras de gasto |
| Validação e preenchimento determinísticos | `apps/api/src/services/validation.ts:72` | Não gastar tokens para regras já expressas em código |
| Normalização de referências de ativos/campanhas | `packages/ai/src/normalize.ts:29` | Evita aceitar referências inventadas |
| Proteção da troca de plano em lote já publicado/em andamento | `apps/api/src/services/batch-plan.ts:73` | Preserva identidade e publicação existente |
| Filas por responsabilidade | `apps/worker/src/index.ts:37` | Reutilizar infraestrutura em vez de instalar orquestrador novo |
| Métricas calculadas antes da IA | `apps/api/src/services/performance.ts:61` | Modelo explica números; não precisa recalculá-los |
| Histórico de análise e correção humana | `apps/api/src/services/analyses.ts:89` | Base útil para rastreabilidade e melhoria |
| Estados de evidência dos aprendizados | `apps/api/src/services/learnings.ts:95` | Hipótese não deve virar verdade só por repetição |

A constituição prefere Postgres + BullMQ abaixo de 1.000 anúncios/dia (`memory/constitution.md:31`). Não medi o volume atual; nenhuma recomendação depende de supor que esse patamar já foi atingido.

## 2. Achados prioritários

### A1 — Geração do lote não usa o conteúdo visual já analisado

**Impacto: qualidade. Prioridade alta.**

`apps/api/src/services/batch-plan.ts:126` envia apenas ID, nome do arquivo, tipo, proporção e duração. `packages/ai/src/context.ts:81` renderiza esses metadados. Não entram observações visuais, transcrição, revisões humanas ou aprendizados nesse contexto.

[INFERÊNCIA] A copy pode combinar com o briefing e ainda não combinar com o que aparece ou é falado na peça. Não é possível medir a frequência sem amostras reais.

**Proposta:** enriquecer o contexto com análise atual do criativo, claims aprovados, produto/oferta e exemplos selecionados. Incluir origem, revisão e limitações. Analisar uma vez e reutilizar observações compactas; não reenviar todos os frames a cada variação de copy.

**Aceite proposto:** quando houver análise válida, a geração recebe essa revisão; quando não houver, a ausência fica explícita. Nenhum detalhe visual pode ser apresentado como observado sem evidência fornecida.

### A2 — Contexto de copy perde claims permitidos e exemplos aprovados

**Impacto: qualidade e retrabalho. Prioridade alta.**

O prompt pede respeito a claims permitidos (`packages/ai/prompts/copy.v1.md:7`), mas `renderCopyContext` não inclui `allowed_claims` nem `examples` (`packages/ai/src/context.ts:111`). O caminho de plano inclui esses campos; os dois caminhos são inconsistentes.

**Experimento:** trocar claims e exemplos mantendo os demais dados produziu exatamente o mesmo prompt de copy.

**Proposta:** manter o perfil da marca coerente nos dois contextos. Selecionar poucos exemplos realmente relevantes, em vez de simplesmente acrescentar mais texto.

**Aceite proposto:** alterações em claims/exemplos relevantes alteram contexto e identidade de cache; exemplos de outro cliente nunca entram no prompt.

### A3 — Identidade de cache incompleta e regeneração ambígua

**Impacto: qualidade, atribuição de modelo e avaliação de custo. Prioridade alta.**

- Plano/copy/política usam hash de versão e prompt, sem modelo (`packages/ai/src/client.ts:75`, `packages/ai/src/client.ts:141`, `packages/ai/src/client.ts:213`). A consulta persistida também não filtra modelo (`packages/db/src/repos/ai-generations.ts:22`).
- Em cache hit, metadados informam o modelo configurado agora, não necessariamente o que produziu a saída (`packages/ai/src/client.ts:216`).
- Análise de conteúdo usa asset, versão de prompt e quantidade de frames, sem marca, modelo, timestamps ou transcrição (`packages/creative-intel/src/analyze.ts:79`).
- `regenerate` permite substituir o plano, mas não é repassado como bypass ou nova variante para `AiClient` (`apps/api/src/services/batch-plan.ts:93`, `apps/api/src/services/batch-plan.ts:137`).

**Experimentos:** mudar marca/modelo conservou hash da análise. Classificação com modelo B reutilizou saída gerada por A, reportando B e fazendo apenas uma chamada ao invoker.

**Proposta:** identidade canônica com finalidade, escopo do cliente, modelo, versão de prompt/schema, conteúdo relevante e revisões. Separar explicitamente “reutilizar resultado” de “gerar outra alternativa”. Incluir prevenção de chamadas simultâneas iguais antes do provedor; conflito de insert depois da chamada não recupera dinheiro gasto.

**Aceite proposto:** contexto/modelo relevante diferente não reutiliza resultado antigo; mesma identidade simultânea executa uma inferência; cache hit preserva proveniência; pedido explícito de nova alternativa tem contrato distinto de retry.

### A4 — Campo de marca perde-se entre rota e serviço

**Impacto: qualidade. Prioridade alta; evidência estática.**

A rota aceita `brand_context` e passa `body` diretamente (`apps/api/src/routes/analyses.ts:37`, `apps/api/src/routes/analyses.ts:44`). O serviço lê `input.brandContext` (`apps/api/src/services/analyses.ts:59`). `force` é compartilhado e permite a compatibilidade estrutural, mas não converte o nome da propriedade.

**Proposta:** mapear explicitamente DTO HTTP para entrada do serviço. Corrigir junto da identidade do cache, para não manter respostas produzidas sem marca.

**Aceite proposto:** enviar `brand_context` pela rota faz esse texto chegar ao prompt. Verificar na fronteira HTTP, não só chamando o serviço diretamente.

### A5 — Cache da análise é consultado depois do trabalho caro

**Impacto: latência, CPU e memória. Prioridade alta.**

`apps/api/src/services/analyses.ts:38` baixa o original inteiro; `sampleVideo` roda antes da consulta ao cache em `apps/api/src/services/analyses.ts:51`. Mesmo um hit repete download e amostragem. `packages/storage/src/index.ts:75` materializa os bytes completos.

O sampler aceita no máximo 50 MB e 60 s (`packages/creative-intel/src/sampler.ts:7`), mas confere bytes depois do download. Ele escreve o vídeo em disco para probe e novamente para amostragem, e inicia ffmpeg sequencialmente por timestamp (`packages/creative-intel/src/sampler.ts:70`, `packages/creative-intel/src/sampler.ts:103`).

**Correção de expectativa:** upload/publicação em streaming não significa que a análise de IA também seja streaming. A afirmação “vídeo inteiro nunca entra na memória do sistema” não se sustenta nesse caminho.

**Proposta:** verificar elegibilidade por metadados antes do download; consultar cache pela revisão da mídia e versão da estratégia de amostragem; no miss, usar arquivo local único e reaproveitar derivadas. Otimizar extração de frames só depois de medir seu peso.

**Aceite proposto:** hit de análise não baixa original nem inicia ffmpeg; arquivo sabidamente fora do limite falha antes do download; pico de memória medido no maior arquivo admitido e na concorrência configurada.

### A6 — Análise declara imagens como JPEG e não usa transcrição real

**Impacto: compatibilidade e qualidade multimodal. Prioridade alta para MIME; transcrição é decisão de produto.**

Imagem estática usa bytes originais como `jpeg` (`apps/api/src/services/analyses.ts:43`); `analyzeContent` declara todos os frames `image/jpeg` (`packages/creative-intel/src/analyze.ts:102`). Para PNG/WebP, há divergência entre payload e tipo declarado. Falha no provedor não foi reproduzida nesta análise.

Transcrição é sempre `unavailableTranscriber` (`apps/api/src/services/analyses.ts:44`). O sampler extrai áudio (`packages/creative-intel/src/sampler.ts:114`), mas o serviço usa apenas os frames e não envia esse áudio a um transcritor.

**Proposta:** normalizar imagens com Sharp já instalado ou respeitar formatos suportados pelo provedor. Não extrair áudio enquanto ninguém o consome. Se a copy depender de fala, aprovar transcrição sob demanda, com cache por conteúdo/idioma/provedor e custo explícito.

**Aceite proposto:** JPEG/PNG/WebP aceitos pelo produto chegam corretamente codificados à IA; ausência de áudio/transcrição permanece explícita. Nenhum texto falado é inventado.

### A7 — Schema de análise não garante evidência útil

**Impacto: confiança nas gerações e relatórios. Prioridade alta.**

`packages/creative-intel/src/analyze.ts:147` verifica formato, mas aceita observação com `evidence_refs: []`; não vincula timestamps aos frames fornecidos. A rota de correção humana já exige pelo menos uma referência (`apps/api/src/routes/analyses.ts:14`).

**Experimento:** invoker controlado retornando uma observação sem referências foi aceito pelo analisador.

**Proposta:** usar schema compartilhado e validar referências contra o material realmente observado. Proibir referência de transcrição quando ela estiver indisponível. Isso valida proveniência, não prova que a interpretação visual é verdadeira; avaliação humana continua necessária.

**Aceite proposto:** observação sem evidência ou com referência inexistente é recusada; limitações não são convertidas em fatos.

### A8 — Relatórios cortam o snapshot de forma insegura e fazem N+1

**Impacto: qualidade, confiabilidade e latência. Prioridade alta.**

`apps/api/src/services/reports.ts:82` aplica `JSON.stringify(snapshot).slice(0, 12000)`. Isso pode cortar um objeto no meio e remover a seção de conteúdo, que vem depois das linhas de métricas. O validador recebe o snapshot completo, embora o modelo tenha recebido apenas parte.

**Experimento:** snapshot sintético grande submetido à mesma expressão deixou de ser JSON válido.

O serviço também consulta análises uma por uma para até 50 assets (`apps/api/src/services/reports.ts:54`). Seleciona assets do cliente, não explicitamente as peças responsáveis pelo recorte de performance.

**Proposta:** construir snapshot compacto e válido antes de serializar. Seleção determinística vinculada a período/conta/variantes, orçamento de contexto, cobertura e itens omitidos explícitos. Consultar análises em lote e validar a saída contra o snapshot efetivamente enviado.

**Aceite proposto:** contexto sempre parseável; fatos citados presentes no snapshot enviado; cobertura não sugere totalidade quando há omissões; quantidade de consultas não cresce uma por criativo.

### A9 — IA e ffmpeg executam dentro da requisição da API

**Impacto: estabilidade e tempo percebido. Prioridade alta após as correções de contrato.**

Análise espera processamento completo na rota (`apps/api/src/routes/analyses.ts:40`); planejamento espera IA (`apps/api/src/services/batch-plan.ts:137`); relatórios usam timeout de 120 s no invoker (`apps/api/src/services/reports.ts:86`). A API tem teto de 512 MB (`infra/docker-compose.prod.yml:155`).

Existem filas para publish, sync, Drive, status e insights, mas não para análise/geração (`packages/config/src/constants.ts:97`).

**Proposta:** começar movendo análise de mídia para job com status persistido, idempotência e concorrência limitada. Usar o mesmo repositório/imagem, com processo separado do worker de publicação quando necessário para isolamento de CPU/memória. Uma fila distinta no mesmo processo não garante isolamento de recursos. Mover geração/relatórios depois, conforme latência medida.

**Aceite proposto:** requisição confirma recebimento sem esperar ffmpeg/LLM; usuário pode acompanhar, recuperar resultado e tratar falha; falhas de IA não degradam publicação. Medir separadamente tempo de fila e tempo de execução.

### A10 — Validação de lote serializa chamadas de política

**Impacto: latência. Prioridade média/alta quando `usePolicyAi` estiver ligado.**

`apps/api/src/services/validation.ts:42` percorre drafts sequencialmente, aguardando classificador por item em `apps/api/src/services/validation.ts:76`. No miss de cache, o tempo soma latências de chamadas.

**Proposta:** validar regras baratas primeiro, deduplicar textos equivalentes e classificar com concorrência pequena/configurada. Não usar `Promise.all` sem limite. Preservar aprovação por fingerprint e estados de publicação. A decisão de pular IA em item já bloqueado deve ser explícita para não perder feedback útil.

O catch transforma indisponibilidade em aviso mesmo com modo de política `block` (`apps/api/src/services/validation.ts:176`). Não mudar silenciosamente: decidir se indisponibilidade exige revisão humana ou apenas aviso e documentar o contrato.

**Aceite proposto:** mesma copy repetida não causa inferência repetida; concorrência nunca excede teto; classificação indisponível tem estado inequívoco; ganho medido com lotes pequenos e grandes.

### A11 — Total operacional de IA não é uma contabilidade completa

**Impacto: decisões de custo potencialmente erradas. Prioridade alta.**

`packages/db/src/repos/ops.ts:6` soma só `aiGenerations`. Análises e relatórios gravam custo em estruturas próprias (`apps/api/src/services/analyses.ts:74`, `apps/api/src/services/reports.ts:103`). Falhas de validação depois de resposta paga não chegam ao save de geração (`packages/ai/src/client.ts:109`, `packages/ai/src/client.ts:121`).

A tabela de cache faz upsert e, em conflito, atualiza saída/latência sem registrar outra cobrança (`packages/db/src/repos/ai-generations.ts:60`). Cache e histórico de consumo estão misturados.

**Proposta:** separar resultado reutilizável de registro de cada tentativa. Capturar uso assim que o provedor responde, inclusive quando o schema é recusado. Consolidar plano, copy, política, análise e relatório com finalidade, cliente, modelo real, status, tokens, custo estimado e latência. Registrar incerteza quando não houver uso retornado; reconciliar com faturamento, sem inventar tokens.

**Aceite proposto:** duas chamadas pagas iguais produzem dois registros de consumo e um resultado reutilizável; falha pós-resposta conta; total inclui todas as finalidades; cache hit não vira cobrança fictícia.

### A12 — Qualidade comercial e aprendizado ainda precisam de ciclo de avaliação

**Impacto: melhoria sustentável. Prioridade alta antes de trocar modelos.**

Os testes de geração observados usam invoker controlado (`packages/ai/test/plan.test.ts:86`). Isso é adequado a contratos, mas não mede clareza, persuasão, aderência à peça ou diversidade de ângulos.

Há persistência de feedback `used/edited/rejected` (`packages/db/src/repos/ai-generations.ts:69`); a busca de referências não encontrou consumidor desse setter nos fluxos pesquisados. Aprendizados podem gerar briefing de teste (`apps/api/src/services/learnings.ts:54`), porém não entram automaticamente no `PlanContext`.

**Proposta:** fechar feedback por geração/variação e montar avaliação offline com briefings representativos, criativos e rubrica humana. Recuperar poucos aprendizados aprovados do mesmo cliente, preservando hipótese/observação/teste controlado, resultado negativo e limitações. Começar com filtros SQL; não instalar banco vetorial sem necessidade demonstrada.

**Aceite proposto:** geração pode ser vinculada a aceite/edição/rejeição; comparação de versões usa conjunto reservado e revisão cega; hipótese nunca é enviada como verdade comprovada.

## 3. Arquiteturas possíveis

| Caminho | Vantagem | Custo/risco | Recomendação |
|---|---|---|---|
| A. Corrigir contexto/cache/contabilidade mantendo fluxos síncronos | Menor alteração; resolve incorreções reais | API continua fazendo trabalho pesado | Primeira entrega |
| B. Mesmo monorepo, jobs de IA/mídia isolados, contexto versionado e avaliação | Melhor controle de latência, recursos e qualidade | Estado de job, UI de progresso e cancelamento precisam de contrato | Alvo incremental recomendado |
| C. Serviços independentes, roteador externo, banco vetorial e vários provedores | Escalabilidade organizacional e especialização | Mais implantação, rede, observabilidade e avaliação | Não adotar sem volume/evidência |

A proposta é A → B, sem reescrever a publicação. Escolher e aprovar o alvo antes de detalhar tarefas executáveis. Trocar Anthropic por outro fornecedor exige tratar também a restrição da constituição (`memory/constitution.md:34`).

## 4. Estratégia de qualidade das gerações

1. **Contexto confiável:** oferta, produto, claims aprovados, voz, criativo analisado e limitações. Dado ausente vira pendência.
2. **Planejamento separado do preenchimento mecânico:** manter estrutura aprovada e gerar novamente apenas copies/itens solicitados. Não regenerar campanha inteira para mudar um título.
3. **Diversidade verificável:** benefício, prova disponível, objeção e urgência apenas quando sustentados pela oferta. Comparar semelhança entre variações; diversidade não pode produzir claims inventados.
4. **Validação determinística antes de revisão por IA:** referências, URLs, campos, limites, termos proibidos e proveniência.
5. **Revisão humana com feedback:** distinguir correção de factualidade, voz, oferta e preferência estética.
6. **Avaliação antes de roteamento:** baseline e candidato nos mesmos casos, com versão de prompt/modelo/contexto. Não usar CTR/CPA isolados como prova de copy melhor; público, orçamento, placement e maturidade confundem o resultado.

Conjunto inicial sugerido: 30–50 casos representativos, incluindo briefing incompleto, imagem sem texto, vídeo dependente de fala, claims restritos e campanhas existentes. Tamanho final depende da diversidade de clientes. Reservar parte para avaliação, sem usá-la para ajustar prompts.

Rubrica sugerida: fidelidade à oferta, aderência visual, voz, clareza, diversidade, conformidade e esforço de edição. Segurança e factualidade são gates; nota média não pode compensar falha grave.

## 5. Como reduzir custo sem piorar qualidade

### Ordem de investimento

1. Evitar chamadas duplicadas e resultados reprovados por contrato quebrado.
2. Corrigir métricas de consumo e separar cache de histórico.
3. Enviar contexto selecionado e respostas proporcionais à tarefa.
4. Reutilizar análises/revisões e regenerar somente o necessário.
5. Avaliar modelo econômico para tarefas delimitadas; escalar somente quando a avaliação justificar.
6. Avaliar cache de prefixo do provedor para system/tools/contexto estável, se o tamanho e a repetição atingirem as condições do modelo. É diferente do cache de resposta do aplicativo.

`packages/ai/src/invoker.ts:45` usa máximo padrão de 8.192 tokens para todas as tarefas. Isso não significa cobrança de 8.192 em toda chamada. Ajustar limites por finalidade evita saídas excessivas, mas limites baixos podem truncar planos válidos. Detectar encerramento incompleto e dimensionar a saída esperada.

### Modelo econômico: exemplo, não promessa

A função real de custo foi executada com 3.000 tokens de entrada e 1.000 de saída:

| Entrada da tabela local | Custo estimado configurado |
|---|---:|
| `claude-sonnet-4-6` | US$ 0,024 |
| `claude-haiku-4-6` | US$ 0,008 |

Fonte: `packages/config/src/constants.ts:84`. Esses são preços configurados no projeto, não uma confirmação de catálogo ou tarifa vigente.

Para essa hipótese de tokens, uma chamada econômica seguida de outra chamada completa cara custa US$ 0,032. Se todas escalarem, fica mais caro. Com probabilidade de escalada p, o custo simplificado é `0,008 + p × 0,024`, sem incluir revisão adicional; só vence a chamada cara direta se p < 2/3. Medir tokens reais, taxa de aceitação e latência total antes da decisão.

Métrica principal: **custo total de tentativas por geração aceita**, não somente custo por chamada bem-sucedida. Acompanhar tempo de edição humana separadamente.

### Cache do provedor

O invoker atual registra apenas `input_tokens` e `output_tokens` (`packages/ai/src/invoker.ts:66`). Documentação consultada confirma campos separados de criação/leitura de cache. Ao adotar cache de prefixo, atualizar contabilidade e pricing dessas categorias; somá-las com o mesmo preço de input comum não é correto.

Fontes técnicas consultadas via Context7:
- SDK TypeScript e uso: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts
- Exemplos de cache: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/tests/api-resources/messages/messages.test.ts
- Documentação indicada pelo SDK: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Não recomendo criar um gateway próprio nem adicionar provedor agora. Primeiro obter baseline confiável com o invoker existente.

## 6. Velocidade e infraestrutura

- **Cache antes de download/ffmpeg:** benefício independente da latência do LLM e sem perda de qualidade.
- **N+1 de relatórios:** buscar análises em lote; relacionar conteúdo ao recorte, não aos primeiros 50 assets.
- **Concorrência limitada:** reduzir soma das chamadas de política sem saturar fornecedor, banco ou CPU.
- **Job de mídia isolado:** prioridade sobre aumentar RAM da API. O limite de 512 MB da API e leitura integral do original justificam medir RSS sob concorrência.
- **Endpoint interno de storage:** API/worker usam domínio público do S3 no compose (`infra/docker-compose.prod.yml:134`, `infra/docker-compose.prod.yml:166`). O mesmo cliente faz I/O e assinatura. Avaliar cliente interno para transferência e endpoint público para presign, preservando assinatura e acesso do browser. Benefício de latência é hipótese a medir, não economia comprovada de egress.
- **Performance por volume:** `getPerformance` materializa observações e agrega na aplicação (`apps/api/src/services/performance.ts:20`, `apps/api/src/services/performance.ts:61`). Medir linhas, bytes, tempo SQL e CPU; só então considerar agregação SQL/índices/rollups. Não há EXPLAIN ou evidência nesta análise para prescrever índice específico.

Não aumentar concorrência da publicação para acelerar IA. A publicação tem limites próprios da Meta e estado financeiro sensível.

## 7. Sequência recomendada de entregas

Estas são frentes propostas, não `tasks.md` aprovado. Cada frente deverá ser especificada e dividida em commits atômicos antes da execução.

| Ordem | Entrega | Critério de saída |
|---|---|---|
| 1 | Corrigir contexto de marca/copy, MIME, evidência e snapshot de relatório | Casos de contrato reproduzidos passam; nenhuma omissão silenciosa de contexto |
| 2 | Corrigir identidade/proveniência de cache e regeneração | Mudança relevante invalida; mesma entrada simultânea deduplica; nova alternativa tem comportamento explícito |
| 3 | Contabilidade por tentativa + feedback + baseline de qualidade | Custos de todas as finalidades e tentativas visíveis; baseline reproduzível |
| 4 | Cache antecipado, queries em lote e job de mídia | Hit sem processamento; API livre de ffmpeg de análise; RSS/latência medidos |
| 5 | Contexto visual e aprendizados integrados à geração | Aderência e esforço de edição melhores na avaliação, sem regressão factual |
| 6 | Roteamento econômico e cache de prefixo em experimento | Menor custo por aceite, gates de qualidade preservados e latência dentro do alvo acordado |

Começar pelas frentes 1 e 2. Não iniciar troca de modelo enquanto comparação puder estar contaminada pelo cache antigo.

## 8. Gates e métricas para a implementação futura

### Gates de correção

- `WHEN` contexto/modelo/revisão relevante mudar, o cache deve produzir miss e registrar proveniência correta.
- `WHEN` uma análise tiver cache válido, o sistema não deve ler original nem iniciar ffmpeg.
- `WHEN` contexto exceder orçamento, o sistema deve selecionar conteúdo completo e indicar omissões, nunca cortar JSON bruto.
- `WHEN` uma resposta de IA paga falhar na validação, o uso retornado pelo provedor deve continuar registrado.
- `WHEN` uma observação citar evidência ausente, o sistema deve rejeitá-la.
- `WHEN` um job de IA falhar, a publicação existente deve preservar estado, idempotência e restrições PAUSED.

### Métricas de decisão

- p50/p95 por finalidade: fila, download, amostragem, provedor, validação e persistência separados.
- Taxa de aceite sem edição e tempo mediano de edição.
- Falhas factuais, schema inválido e referências inexistentes.
- Custo por geração aceita, por cliente e por finalidade, incluindo tentativas rejeitadas.
- Hit rate, chamadas duplicadas evitadas e escaladas de modelo.
- RSS máximo, CPU e disco temporário por job/concorrência.

Não estabeleci SLOs numéricos fictícios. Baseline primeiro; metas de redução de custo/p95 e margem de não inferioridade de qualidade devem ser aprovadas antes de promover candidato.

Conforme `tlc-spec-driven`, implementação futura exige critérios aprovados, gates por tarefa, commit atômico e Verifier independente com sensor de discriminação. Este relatório não é um PASS de implementação nem substitui o smoke em conta Meta antes de release.

## 9. Evidência executada nesta análise

Experimentos locais, sem alteração de fonte e sem chamadas ao provedor:

| Experimento | Resultado observado |
|---|---|
| Trocar claims/exemplos em `renderCopyContext` | Prompt permanece igual |
| Trocar marca e modelo em `analyzeContent` | Hash permanece igual |
| Retornar observação com referências vazias | Analisador aceita |
| Compartilhar cache de política entre modelos A e B | B recebe cache de A, reporta B; uma chamada ao invoker |
| Serializar snapshot grande e aplicar corte de 12.000 caracteres | JSON inválido |
| Calcular preço configurado para 3.000 input + 1.000 output | US$ 0,024 / US$ 0,008 |

Provas estáticas adicionais: incompatibilidade `brand_context`/`brandContext`, leitura integral antes do cache, análise síncrona na API, transcrição indisponível, N+1 e agregação de custos parcial.

Não foram executados novos benchmarks de modelo, carga, banco ou testes completos do projeto. Nenhuma economia financeira, compatibilidade de modelo atual ou melhora de conversão foi declarada como medida.

## 10. Estado dos gates depois da primeira implementação

O que já tem prova executável no repositório, depois das frentes 1 a 6 (sem a
decisão de modelo, que continua condicionada a baseline):

| Gate (§8) | Onde está a prova |
|---|---|
| Contexto/modelo/revisão relevantes invalidam o cache | `packages/ai/test/cache.test.ts` (identidade) + `apps/worker/test/analysis-run.test.ts` |
| Análise em cache não lê o original nem inicia ffmpeg | `pnpm prova:a5` (storage falso que explode se chamado) |
| Contexto acima do orçamento seleciona e declara omissão | `packages/ai/test/context-budget.test.ts` |
| Uso pago continua registrado quando a validação falha | `apps/api/test/ai-usage.test.ts` / `packages/ai/test/tracked-invoker.test.ts` |
| Observação com evidência ausente é rejeitada | `packages/creative-intel/test/findings.test.ts` |
| Falha de IA preserva publicação (idempotência e PAUSED) | `apps/worker/test/analysis-run.test.ts` + `e2e/jornada-9-analise.spec.ts` |
| Indisponibilidade do classificador não vira "validado por regras" em modo `block` | `pnpm prova:a10` |
| Análise sai da requisição da API | `e2e/jornada-9-analise.spec.ts` (job + tela) |
| Análise visual e aprendizados entram no plano | `pnpm prova:a1` + `apps/api/test/batch-plan.test.ts` |
| Resposta truncada no limite é falha explícita | `packages/ai/test/invoker.test.ts` |

Métricas que continuam **sem** número medido — dependem de rodar com chave real
e conjunto reservado, e nenhuma foi declarada como medida nesta análise:
p50/p95 por etapa, taxa de aceite sem edição, custo por geração aceita (a query
está em `docs/avaliacao-geracoes.md`), hit rate de cache, ganho do endpoint
interno de storage e RSS sob concorrência.

Provas locais: `pnpm prova:a1`, `pnpm prova:a5` e `pnpm prova:a10` rodam contra
o banco de desenvolvimento (`DATABASE_URL` do compose local), escrevem nele e
usam invoker falso — nenhuma chamada paga, nunca em produção.
