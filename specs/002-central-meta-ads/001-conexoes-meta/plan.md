# SPEC-001 — Plano técnico

**Escopo:** só fechar os gaps da auditoria. Sem Insights, sem matriz além de doc+teste, sem separar tokens por capacidade (fica como decisão documentada).

## Decisões

1. **Gate de autorização no worker, barato e local primeiro.** `publishLocked`
   recusa antes de qualquer create quando: conexão ≠ `active`, conta com
   `pausedUntil` futuro (já existe), ou conta fora do escopo da conexão.
   Revalidação remota (`getMe`) só quando `lastCheckedAt` > 15 min, com o
   resultado gravado — job normal paga zero chamada extra.
2. **Revogação pós-enqueue barra execução (AC-001-05).** Conexão revogada/
   `needs_attention` no momento da execução → item vai a `failed` com erro de
   autorização traduzido, zero chamadas de create, alerta mantém o existente.
3. **Matriz de capacidades como doc testado, não tabela solta.**
   `docs/capability-matrix.md` lista cada capacidade (leitura objetos/Insights,
   publicação por formato, Page/IG, eventos, breakdowns) com estado
   `validada | não-validada | indisponível` + evidência (comando/ambiente/
   conta/data). Teste trava: nenhuma `validada` sem linha de evidência.
   Tudo começa `não-validada` exceto o que o smoke/CI já prova (criar
   PAUSED imagem/vídeo/carrossel na Graph falsa + leitura de objetos).
4. **Diagnóstico por conta consolida o existente.** `GET
   /ad-accounts/{id}/connection-check` (ou extensão do health): conexão,
   tier configurado vs observado, última verificação, pausa, capacidades da
   matriz aplicáveis. Sem publicar nada (AC-001-02).
5. **Auth-fail sem loop + rotação visível.** Teste: token inválido no sync →
   `needs_attention`, contas pausadas, job termina (sem reagendamento
   infinito). Expõe `rotateConnectionToken` em rota admin + botão na UI com
   re-teste — sem isso rotação é código morto.

## Arquivos reais tocados

- `apps/worker/src/publish/pipeline.ts` (gate), `apps/worker/src/meta.ts`
  (revalidação com janela), `apps/api/src/routes/ad-accounts.ts` + serviço
  (diagnóstico), `docs/capability-matrix.md`, teste de matriz,
  `apps/api` rota de rotação + teste, smoke: conexão revogada pós-enqueue.
- Migração: nenhuma (só leitura de colunas existentes). Se faltar coluna
  (ex. `revoked_at`), aditiva.

## Gates por tarefa

Teste que falha → implementação mínima → gate padrão → evidência no PR.
Nenhum ACTIVE, nenhuma mutação fora do publish, segredos fora de log/fila.
