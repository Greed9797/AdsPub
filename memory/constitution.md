# Constituição do Projeto AdPub

> Copiar para `.specify/memory/constitution.md` após `specify init`. Todo `plan.md` deve passar pelo "Constitution Check" contra estes artigos.

## Princípios fundamentais (Core Principles)

### I. Nenhuma escrita na Meta fora do pipeline (NÃO NEGOCIÁVEL)
Toda criação/alteração de campanha, conjunto, criativo ou anúncio acontece **exclusivamente** pelo pipeline de publicação (workers + máquina de estados). Nem a UI, nem a IA, nem scripts avulsos chamam endpoints de escrita da Graph API diretamente. Racional: uma única porta = uma única auditoria, uma única política de retry e de rate limit.

### II. Padrão seguro: pausado, confirmado, limitado
- Todo anúncio/conjunto/campanha nasce com `status = PAUSED`.
- Ativação, alteração de orçamento, lance ou público exigem ação humana explícita com confirmação.
- A IA produz **dados** (`BatchPlan`, copies, avaliações); nunca executa ações.
- Existe um teto configurável de anúncios por lote e por conta/dia.

### III. Idempotência e reprocessamento
Cada item publicável tem `idempotency_key`; cada etapa persiste o ID retornado pela Meta antes de avançar. Reexecutar um job **nunca** cria objeto duplicado. Falhas não transientes param no item, não no lote; o item pode ser reprocessado isoladamente.

### IV. Segredos e tokens
Tokens do System User e chaves de app são cifrados em repouso (AES-256-GCM, chave mestra fora do banco), nunca aparecem em logs, respostas de API ou payloads de auditoria (mascarados). `appsecret_proof` em toda chamada. Acesso por papel (RBAC) e por conta.

### V. Contratos primeiro, testes antes
- Schemas zod compartilhados são a fonte de verdade entre UI, API, workers e IA.
- Regras de negócio (validação, nomenclatura, mapeamento página/IG, máquina de estados) têm testes unitários **escritos antes** da implementação.
- Integração com a Meta é testada por **testes de contrato** gravados (fixtures de resposta) e por uma suíte de fumaça contra conta de teste (sandbox) antes de cada release.

### VI. Versão da API fixada e observável
A versão da Graph API é uma configuração única (`META_API_VERSION`), presente em toda URL. Toda chamada registra: endpoint, versão, latência, código de erro, headers de uso de rate limit. Migração de versão é uma feature com spec própria.

### VII. Simplicidade e legibilidade para o gestor
Erros da Meta são traduzidos para linguagem de operação ("imagem menor que 600 px — reexporte em 1080×1350") com a mensagem original disponível em "detalhes". Nenhuma tela exige conhecer IDs da Meta. Preferir soluções simples (Postgres + BullMQ) a infraestrutura de workflow enquanto o volume for < 1 000 anúncios/dia.

## Restrições técnicas
- **Stack**: TypeScript (Node 22 LTS), Next.js (App Router), Postgres, Redis/BullMQ, storage S3-compatível, Anthropic API. Alternativas exigem emenda à constituição.
- **Monorepo** com pacotes: `web`, `api`, `worker`, `meta-client`, `ai`, `db`, `shared`.
- **Dados pessoais**: não armazenar dados de consumidores finais. Colaboradores: nome e e-mail corporativo apenas.
- **Retenção**: auditoria ≥ 12 meses; mídia original ≥ 90 dias após publicação.

## Fluxo de desenvolvimento
1. Feature nasce como `specs/NNN-nome/spec.md` (o quê/por quê, sem tecnologia).
2. `plan.md` passa pelo Constitution Check; violações devem ser justificadas na tabela de complexidade.
3. `tasks.md` organizado por história de usuário, cada história testável de forma independente.
4. PR só é aprovado com: testes verdes, lint, sem segredo no diff, changelog atualizado.
5. Toda mudança que toca o pipeline de publicação exige teste de fumaça em conta sandbox antes do deploy.

## Governança
Esta constituição prevalece sobre qualquer outra prática. Emendas exigem: proposta escrita, aprovação do dono do produto e do tech lead, atualização da versão abaixo e plano de migração para o código existente.

**Versão**: 1.0.0 | **Ratificada**: 2026-09-08 | **Última emenda**: 2026-09-08
