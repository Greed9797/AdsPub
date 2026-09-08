# Especificação de Feature: MVP — Publicação em lote de anúncios Meta via IA

**Branch**: `001-mvp-publicacao-lote` | **Criado em**: 2026-09-08 | **Status**: Draft
**Input**: PRD.md §5.1, §6, §7 — "aplicação web para subir ~80 anúncios/dia em 17 contas da BM via IA, com validação, fila resiliente e auditoria"

---

## Cenários de usuário e testes *(obrigatório)*

### História 1 — Conectar a BM e sincronizar ativos (Prioridade: P1)
Como **admin**, quero conectar a Business Manager com um System User token e ver todas as contas, páginas, contas do Instagram e pixels sincronizados, para que os gestores só escolham "qual conta" e nunca digitem IDs.

**Por que P1**: sem isso nada mais funciona.
**Teste independente**: com um token válido de conta de teste, a tela de Contas lista a conta, sua página e IG associados e mostra "conexão OK" com a versão da API e o tier de acesso.

**Cenários de aceite**
1. **Dado** um token válido com `ads_management` e `business_management`, **quando** o admin salva a conexão, **então** o sistema testa (`/me`, `/{business_id}/owned_ad_accounts`), cifra o token, e exibe status "Conectado", tier (`limited`/`full`) e data de expiração.
2. **Dado** uma conexão ativa, **quando** o admin clica "Sincronizar", **então** contas, páginas, IGs, pixels, campanhas e conjuntos ativos são atualizados e o horário da última sincronização aparece.
3. **Dado** um token inválido/expirado, **quando** qualquer job tenta usar a conexão, **então** o sistema marca a conexão como "Precisa de atenção", pausa as filas de todas as contas e alerta os admins — sem expor o token.
4. **Dado** contas sincronizadas, **quando** o admin define para uma conta a página, o IG e o pixel padrão, **então** novos lotes dessa conta já vêm com esses valores.

### História 2 — Importar e validar criativos (Prioridade: P1)
Como **gestor**, quero apontar uma pasta do Google Drive (ou arrastar arquivos) e receber os criativos validados na biblioteca do cliente, para não descobrir erro de proporção só depois de publicar.

**Teste independente**: importar uma pasta com 5 imagens (uma 800×600) e 2 vídeos; a biblioteca mostra 6 aceitos e 1 rejeitado com o motivo.

**Cenários de aceite**
1. **Dado** uma URL de pasta do Drive acessível pela conta de serviço, **quando** o gestor importa, **então** todos os arquivos de imagem/vídeo são baixados, deduplicados por SHA-256 e listados com miniatura, dimensões, proporção detectada (1:1, 4:5, 9:16, 16:9…), duração e tamanho.
2. **Dado** um arquivo fora das specs (proporção não suportada, < 600 px, vídeo > limite configurado), **quando** a validação roda, **então** ele fica como "Rejeitado" com motivo legível e sugestão de correção.
3. **Dado** um criativo já importado antes (mesmo hash) para o mesmo cliente, **quando** importado de novo, **então** o sistema reaproveita o registro e não duplica.
4. **Dado** um criativo já enviado à conta X (com `image_hash`/`video_id` salvos), **quando** for usado em novo lote na conta X, **então** o upload não é refeito.

### História 3 — Montar o lote a partir de briefing com IA (Prioridade: P1)
Como **gestor**, quero colar um briefing e receber um plano de lote completo (estrutura, mapeamento criativo → conjunto, copies, nomes, URLs) que eu possa editar numa grade, para transformar 15 minutos de montagem em 2 de revisão.

**Teste independente**: com o briefing de exemplo (`quickstart.md`) e 6 criativos, o sistema gera um `BatchPlan` válido em ≤ 40 s, com 3 copies por criativo, e o gestor consegue editar uma copy e remover uma linha.

**Cenários de aceite**
1. **Dado** um briefing em texto livre + criativos selecionados + conta escolhida, **quando** o gestor clica "Gerar plano", **então** a IA retorna um `BatchPlan` que passa no schema, referencia apenas criativos/campanhas/conjuntos existentes ou marcados como "novo", e é exibido em grade editável.
2. **Dado** um perfil de voz do cliente cadastrado (tom, termos proibidos, exemplos), **quando** as copies são geradas, **então** nenhuma contém termo proibido e os limites recomendados (texto principal ≤ 125, título ≤ 40, descrição ≤ 30 caracteres) são respeitados ou marcados como aviso quando excedidos de propósito.
3. **Dado** um plano gerado, **quando** o gestor edita copy, CTA, link, nome ou troca criativo de linha, **então** a alteração é salva e a linha fica marcada como "editada".
4. **Dado** que a IA não conseguiu inferir algo (ex.: link de destino), **quando** o plano é exibido, **então** o campo aparece como "Pendente" e a validação bloqueia até preenchimento — a IA não inventa URL.
5. **Dado** o modo formulário (sem IA), **quando** o gestor monta a matriz criativos × copies manualmente, **então** o resultado é o mesmo `BatchPlan` e segue o mesmo fluxo.

### História 4 — Validar antes de publicar (Prioridade: P1)
Como **coordenador**, quero que o sistema bloqueie lotes com erro (campo faltando, mídia inválida, página incompatível, nome fora do padrão) e destaque avisos de política, para que a taxa de reprovação da Meta caia.

**Cenários de aceite**
1. **Dado** um item sem link, sem página ou com criativo rejeitado, **quando** validado, **então** o item fica `BLOCKED` com a lista de erros e o botão Publicar fica desabilitado para o lote.
2. **Dado** uma copy com padrão de risco (atributo pessoal, antes/depois, promessa de resultado, excesso de maiúsculas), **quando** validada, **então** aparece um aviso com a categoria e o trecho; o lote pode seguir se a política do cliente permitir avisos.
3. **Dado** o template de nomenclatura do cliente, **quando** o nome do anúncio não bate, **então** o sistema sugere o nome correto com um clique.
4. **Dado** uma URL com UTM padrão do cliente configurado, **quando** o item não tem os parâmetros, **então** o sistema preenche automaticamente e marca como "auto".

### História 5 — Publicar em fila com acompanhamento (Prioridade: P1)
Como **gestor**, quero clicar "Publicar (pausado)" e ver cada anúncio avançar pelas etapas até "Publicado" ou "Erro", com os que falharam reprocessáveis isoladamente, para nunca mais ficar esperando tela por tela no Ads Manager.

**Teste independente**: lote de 10 anúncios (6 imagens, 4 vídeos) em conta de teste é publicado com todos `PAUSED` em ≤ 5 min e aparece no Ads Manager com os nomes corretos.

**Cenários de aceite**
1. **Dado** um lote `READY`, **quando** publicado, **então** cada item vira um job e percorre: upload de mídia → garantir campanha → garantir conjunto → criar criativo → criar anúncio (`PAUSED`), persistindo o ID de cada etapa.
2. **Dado** um erro transiente (rate limit, timeout), **quando** ocorre, **então** o job faz retry com backoff exponencial e jitter (máx. configurável) e a UI mostra "Aguardando (rate limit da conta)".
3. **Dado** um erro não transiente (parâmetro inválido, imagem rejeitada), **quando** ocorre, **então** o item vai para `FAILED` com mensagem traduzida + original, e o restante do lote continua.
4. **Dado** um item `FAILED` corrigido pelo gestor, **quando** reprocessado, **então** o pipeline retoma da etapa que falhou (não recria campanha/conjunto/mídia já existentes).
5. **Dado** uma conta com uso de rate limit ≥ 75 %, **quando** há jobs pendentes, **então** a concorrência daquela conta cai para 1 e, ao atingir bloqueio, a fila da conta pausa até `estimated_time_to_regain_access`.
6. **Dado** anúncios publicados, **quando** o poller roda, **então** `effective_status` e `ad_review_feedback` são atualizados e itens reprovados aparecem com o motivo.
7. **Dado** qualquer item, **quando** o gestor clica no ID, **então** abre o objeto no Ads Manager.

### História 6 — Auditoria e permissões (Prioridade: P1)
Como **admin**, quero saber quem criou, editou e publicou cada item e restringir gestores às suas contas.

**Cenários de aceite**
1. **Dado** qualquer ação de escrita (criar lote, editar item, publicar, reprocessar, alterar conexão), **quando** executada, **então** um registro de auditoria guarda ator, ação, entidade, antes/depois e, para chamadas à Meta, payload e resposta (token mascarado).
2. **Dado** um gestor com acesso às contas A e B, **quando** ele acessa a lista, **então** só vê A e B e recebe 403 ao tentar qualquer rota da conta C.
3. **Dado** o login, **quando** o e-mail não pertence ao domínio corporativo, **então** o acesso é negado.

### História 7 — Duplicar lote para outra conta (Prioridade: P2)
Como **coordenador**, quero duplicar um lote publicado para outra conta com remapeamento automático de página/IG/pixel/domínio, para replicar estruturas vencedoras.

**Cenários de aceite**
1. **Dado** um lote publicado na conta A, **quando** duplicado para a conta B, **então** um novo lote `DRAFT` é criado com os padrões de B aplicados e os criativos marcados como "precisa upload em B".

### História 8 — Painel de saúde da API (Prioridade: P3)
Como **admin**, quero ver por conta o uso do rate limit, tier, erros das últimas 24 h e jobs pendentes.

---

### Casos de borda
- Vídeo cujo processamento na Meta demora > N minutos: item fica em `UPLOADING_MEDIA` com polling; timeout configurável → `FAILED` reprocessável.
- Criativo usado em 20 anúncios do mesmo lote: upload único, `image_hash` compartilhado.
- Campanha "nova" referenciada por 5 itens: criada uma vez (lock por `batch_id + campaign_ref`), itens seguintes reutilizam o ID.
- Gestor apaga um item enquanto o lote publica: itens já em execução terminam; item removido só se ainda `QUEUED`.
- Conta sem IG vinculado: anúncio só para Facebook, com aviso.
- Token trocado no meio de um lote: jobs pegam o token vigente na próxima etapa.
- Briefing em outro idioma ou vazio: IA devolve plano parcial com pendências, nunca falha silenciosamente.
- Dois gestores editando o mesmo lote: bloqueio otimista por versão do item (última edição avisa conflito).

---

## Requisitos *(obrigatório)*

### Requisitos funcionais
- **FR-001**: O sistema DEVE permitir cadastrar uma conexão com a BM por System User token, testar e armazenar o token cifrado.
- **FR-002**: O sistema DEVE sincronizar contas de anúncio, páginas, contas do Instagram, pixels, campanhas e conjuntos ativos, sob demanda e a cada N horas.
- **FR-003**: O sistema DEVE permitir definir por conta: página, IG, pixel e domínio padrão; template de nomenclatura; UTM padrão; teto de anúncios/dia.
- **FR-004**: O sistema DEVE importar criativos de pastas do Google Drive e por upload, validar dimensões/proporção/duração/tamanho/tipo contra uma tabela de specs configurável, e deduplicar por SHA-256.
- **FR-005**: O sistema DEVE manter, por conta, o `image_hash`/`video_id` de cada criativo já enviado e reutilizá-los.
- **FR-006**: O sistema DEVE gerar um `BatchPlan` a partir de briefing + criativos + conta, via IA, validado por schema, com pendências explícitas quando faltar informação.
- **FR-007**: O sistema DEVE gerar variações de copy (texto principal, título, descrição, CTA) no perfil de voz do cliente, respeitando limites recomendados.
- **FR-008**: O sistema DEVE oferecer um construtor manual (grade criativos × copies) que produz o mesmo `BatchPlan`.
- **FR-009**: O sistema DEVE validar cada item (obrigatórios, mídia, URL, nomenclatura, compatibilidade página/IG/posicionamento, política) e classificar em erro (bloqueia) ou aviso.
- **FR-010**: O sistema DEVE publicar itens por fila, um job por item, com etapas idempotentes e IDs persistidos por etapa, `status = PAUSED` por padrão.
- **FR-011**: O sistema DEVE aplicar retry com backoff exponencial e jitter em erros transientes e parar em erros não transientes, com mensagem traduzida.
- **FR-012**: O sistema DEVE limitar a concorrência por conta e reagir aos headers de uso de rate limit.
- **FR-013**: O sistema DEVE atualizar periodicamente `effective_status` e `ad_review_feedback` dos anúncios publicados nos últimos 7 dias.
- **FR-014**: O sistema DEVE permitir reprocessar apenas itens `FAILED`, retomando da etapa que falhou.
- **FR-015**: O sistema DEVE registrar auditoria de toda ação de escrita e de toda chamada de escrita à Meta.
- **FR-016**: O sistema DEVE autenticar via Google Workspace e aplicar papéis (admin, coordenador, gestor, leitor) e escopo por conta.
- **FR-017**: O sistema DEVE fixar a versão da Graph API por configuração e registrar versão/endpoint/latência/erro/uso de rate limit em cada chamada.
- **FR-018**: O sistema DEVE permitir duplicar um lote para outra conta com remapeamento de ativos padrão (P2).
- **FR-019**: O sistema DEVE exibir uso de rate limit, tier e erros recentes por conta (P3).
- **FR-020**: O sistema NÃO DEVE criar campanhas dos tipos legados Advantage+ Shopping/App; DEVE usar objetivos `OUTCOME_*`.

### Entidades-chave
- **Conexão Meta**: BM, System User, token cifrado, escopos, tier, status, expiração.
- **Conta de anúncio**: ID, nome, moeda, fuso, cliente, padrões (página, IG, pixel, domínio, nomenclatura, UTM, teto/dia).
- **Cliente**: nome, contas, perfil de voz, termos proibidos, política de avisos.
- **Criativo (asset)**: hash, tipo, dimensões, duração, origem (Drive/upload), status de validação; **uploads por conta** (hash Meta / video_id).
- **Lote (Batch)**: cliente, conta, autor, briefing, `BatchPlan`, status, opções (status inicial, teto).
- **Item do lote (AdDraft)**: refs de campanha/conjunto (existente ou nova), criativo, copies, CTA, link, UTM, nome, status, resultado de validação, IDs Meta por etapa, erro, tentativas, `idempotency_key`.
- **Job de publicação**: item, etapa atual, estado, tentativas, próxima execução, último erro.
- **Registro de auditoria**: ator, ação, entidade, antes/depois, payload/resposta Meta (mascarados).
- **Geração de IA**: lote, versão do prompt, modelo, hash de entrada, saída, tokens, custo, feedback (usada/editada/rejeitada).

---

## Critérios de sucesso *(obrigatório)*
- **SC-001**: Lote de 20 anúncios publicado (todos `PAUSED`, sem erro) em ≤ 5 min P95 em conta de teste.
- **SC-002**: Briefing → `BatchPlan` válido em ≤ 40 s P95, com ≥ 90 % dos campos preenchidos sem edição em briefings completos.
- **SC-003**: ≥ 98 % dos itens publicados sem intervenção humana após a validação, medido nas 2 primeiras semanas do piloto.
- **SC-004**: 0 objetos duplicados na Meta em testes de reprocessamento (100 execuções com falha injetada).
- **SC-005**: Gestor-piloto sobe 10 anúncios em ≤ 8 min de esforço ativo (medido com cronômetro), vs. ≥ 40 min no processo manual.
- **SC-006**: 100 % das ações de escrita com registro de auditoria; 0 tokens em logs (verificado por scan automatizado no CI).
- **SC-007**: Nenhum anúncio criado `ACTIVE` sem confirmação explícita (teste automatizado + auditoria).

## Premissas
- Existe um admin da BM com permissão para criar System User e submeter App Review; Business Verification concluída ou em andamento.
- Os criativos chegam prontos (imagem/vídeo já exportados); o produto não gera mídia.
- 17 contas hoje; arquitetura suporta ≥ 100 contas sem mudança.
- Formatos do MVP: imagem única, vídeo único e carrossel (até 10 cartões). Coleção e catálogo ficam fora.
- Objetivos suportados no MVP: vendas, leads, tráfego, engajamento (`OUTCOME_SALES`, `OUTCOME_LEADS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`).
- Idioma da interface e das copies: português (BR).
