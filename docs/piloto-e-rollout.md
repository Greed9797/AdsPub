# Piloto e rollout (T098 e T100)

> **Estas duas tarefas dependem de execução humana.** Nada aqui é automatizável: o piloto exige dois
> gestores usando o produto no trabalho real por duas semanas, e o rollout exige treinar pessoas e
> migrar contas uma a uma. Este documento é o plano que o dono do produto executa — o software já
> registra tudo o que as métricas precisam.

## 1. Piloto (T098)

**Escopo**: 2 gestores, 3 contas de anúncio, 2 semanas corridas.
**Objetivo**: medir SC-003 e SC-005 com dado real e ajustar os prompts antes de abrir para todo mundo.

### 1.1 Preparação (dia 0)

- [ ] Escolher 3 contas com perfil diferente entre si (ex.: e-commerce com pixel, geração de lead,
      conta só com tráfego) — cobertura de objetivo importa mais que volume.
- [ ] Em `/contas`, definir para cada conta: página, Instagram e pixel padrão e o teto diário
      (`DEFAULT_DAILY_AD_CAP` = 200 é o padrão quando a conta não define o seu).
- [ ] Em `/clientes`, cadastrar por cliente: perfil de voz (tom, público, termos proibidos),
      template de nomenclatura, UTM padrão, domínios de destino aceitos, modo de política
      (`warn`/`block`) e o opt-out de melhorias Advantage+.
- [ ] Em `/usuarios`, dar aos dois gestores o papel `manager` e o escopo das 3 contas (eles recebem
      403 em qualquer outra — FR-016).
- [ ] `META_TIER` do ambiente conferido (`GET /api/v1/health` → `meta_tier`). No piloto, `limited`
      basta: concorrência 1 por conta.
- [ ] Registrar o **baseline manual**: cada gestor cronometra uma subida de 10 anúncios do jeito
      antigo, no Ads Manager. Sem esse número, SC-005 não tem comparação (a meta é ≤ 8 min contra
      ≥ 40 min manuais).
- [ ] Confirmar os alertas no Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` no `.env` do host;
      opcional, mas no piloto vale a pena: token inválido, rate limit e lote com > 20 % de falhas
      chegam no chat).

### 1.2 O que medir e de onde tirar

Todos os dados já são gravados pelo produto. As consultas abaixo rodam direto no Postgres.

#### SC-003 — taxa de intervenção (meta: ≥ 98 % dos itens publicados sem intervenção humana após a validação)

"Intervenção" = alguém precisou editar (`item.update`) ou reprocessar (`item.retry`) o item **depois**
de o lote ter sido validado. Ambas as ações são gravadas em `audit_log` com
`entity_type = 'ad_draft'`.

```sql
-- Itens publicados no período x itens que exigiram intervenção
WITH publicados AS (
  SELECT d.id, d.batch_id
  FROM ad_drafts d
  JOIN batches b ON b.id = d.batch_id
  WHERE d.status IN ('published', 'in_review', 'approved', 'disapproved')
    AND d.published_at >= :inicio
    AND b.ad_account_id = ANY(:contas_piloto)
),
intervencoes AS (
  SELECT DISTINCT a.entity_id::uuid AS draft_id
  FROM audit_log a
  WHERE a.entity_type = 'ad_draft'
    AND a.action IN ('item.update', 'item.retry')
    AND a.created_at >= :inicio
)
SELECT
  count(*)                                            AS itens_publicados,
  count(*) FILTER (WHERE i.draft_id IS NOT NULL)      AS com_intervencao,
  round(100.0 * count(*) FILTER (WHERE i.draft_id IS NULL) / nullif(count(*), 0), 2) AS pct_sem_intervencao
FROM publicados p
LEFT JOIN intervencoes i ON i.draft_id = p.id;
```

Complementos úteis para entender *por que* houve intervenção:

```sql
-- Itens que falharam ao menos uma vez, por erro traduzido
SELECT d.error->>'translated' AS erro, count(*)
FROM ad_drafts d JOIN batches b ON b.id = d.batch_id
WHERE b.ad_account_id = ANY(:contas_piloto) AND d.attempts > 1
GROUP BY 1 ORDER BY 2 DESC;

-- Campos que a IA erra mais (o gestor precisou editar)
SELECT unnest(d.edited_fields) AS campo, count(*)
FROM ad_drafts d JOIN batches b ON b.id = d.batch_id
WHERE b.ad_account_id = ANY(:contas_piloto)
GROUP BY 1 ORDER BY 2 DESC;
```

#### SC-005 — tempo por anúncio (meta: 10 anúncios em ≤ 8 min de esforço ativo)

A medida oficial é **cronômetro**: o gestor marca do "abrir `/lotes/novo`" ao "clicar Publicar
(pausado)". O banco dá o proxy que confere o cronômetro e cobre os dias em que ninguém cronometrou:

```sql
-- Minutos de relógio entre criar o lote e mandar publicar, por anúncio
SELECT
  b.id,
  b.mode,                                    -- 'ai' ou 'manual'
  count(d.id)                                AS itens,
  min(cria.created_at)                       AS criado_em,
  min(pub.created_at)                        AS publicado_em,
  round(extract(epoch FROM (min(pub.created_at) - min(cria.created_at))) / 60.0, 1) AS minutos_lote,
  round(extract(epoch FROM (min(pub.created_at) - min(cria.created_at))) / 60.0
        / nullif(count(d.id), 0), 2)         AS minutos_por_anuncio
FROM batches b
JOIN ad_drafts d ON d.batch_id = b.id
JOIN audit_log cria ON cria.entity_type = 'batch' AND cria.entity_id = b.id::text
                   AND cria.action = 'batch.create'
JOIN audit_log pub  ON pub.entity_type = 'batch'  AND pub.entity_id = b.id::text
                   AND pub.action = 'batch.publish'
WHERE b.ad_account_id = ANY(:contas_piloto)
GROUP BY b.id, b.mode
ORDER BY criado_em;
```

O proxy é **tempo de relógio**, não esforço ativo: um lote deixado aberto no almoço infla o número.
Por isso o cronômetro manda, e o SQL serve para achar outliers e conferir a ordem de grandeza.

#### Métricas de apoio (já registradas)

| Pergunta | Onde |
|---|---|
| A IA cumpre os 40 s de SC-002? | `SELECT purpose, percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM ai_generations GROUP BY 1;` |
| Quanto custa a IA por anúncio? | `ai_generations.cost_usd`, `input_tokens`, `output_tokens` (preços em `AI_PRICING_USD_PER_MTOK`) |
| As copies são aceitas como vieram? | `SELECT feedback, count(*) FROM ai_generations GROUP BY 1;` (`used` / `edited` / `rejected`) |
| Qual versão de prompt gerou o quê? | `ai_generations.prompt_version` (arquivos em `packages/ai/prompts/`) |
| A Meta está reprovando anúncio? | `SELECT effective_status, count(*) FROM ad_drafts WHERE effective_status IS NOT NULL GROUP BY 1;` e `review_feedback` |
| Estamos perto do rate limit? | tela `/saude` e `GET /api/v1/health/accounts`: `rate_usage`, `paused_until`, `pending_jobs`, `error_rate_1h`, `p95_latency_ms` |
| A API da Meta está saudável? | `meta_api_calls` (`status_code`, `error_code`, `latency_ms`, `api_version`) |
| Toda ação tem trilha? (SC-006/O5) | `/auditoria` na web ou `GET /api/v1/audit` |

### 1.3 Rotina do piloto

| Quando | O quê |
|---|---|
| Diário (10 min) | Abrir `/saude`: conta pausada, conexão em "Requer atenção", teto diário batido, erro acima de 10 % na última hora |
| Diário | Passar em `/auditoria` filtrando `item.retry` — todo reprocessamento é uma pista de prompt ou de regra de validação para ajustar |
| Fim de cada semana | Rodar as consultas de SC-003 e SC-005 e anotar na tabela da §1.5 |
| Fim de cada semana | Revisar `edited_fields` e `ai_generations.feedback`; ajustar `packages/ai/prompts/*.md` subindo a versão do prompt (nunca editar em silêncio: `prompt_version` é o que liga a métrica ao texto) |

### 1.4 Critérios de saída do piloto

Todos precisam estar verdes para liberar o rollout:

- [ ] **SC-003**: ≥ 98 % dos itens publicados sem intervenção, medido nas duas semanas cheias.
- [ ] **SC-005**: mediana ≤ 0,8 min por anúncio (10 anúncios em ≤ 8 min) com cronômetro, nos dois
      gestores — não só no mais rápido.
- [ ] **SC-001**: lote de 20 anúncios publicado em ≤ 5 min (P95) — medível pelo intervalo entre
      `batch.publish` e o último `published_at` do lote.
- [ ] **SC-004**: zero objeto duplicado na Meta (conferir no Ads Manager as contas do piloto ao fim
      de cada semana; qualquer duplicata é bug bloqueante da Constituição III).
- [ ] **SC-006**: 100 % das ações com registro em `audit_log`; zero token em log.
- [ ] **SC-007**: zero anúncio criado `ACTIVE` — `SELECT count(*) FROM ad_drafts WHERE effective_status = 'ACTIVE' AND ...`
      só pode acontecer depois de alguém ativar de propósito no Ads Manager.
- [ ] Nenhum incidente aberto de token/credencial (O6).
- [ ] Os dois gestores respondem "usaria de novo amanhã" — se a resposta for morna, achar o motivo
      antes de escalar.

Falhou algum critério: corrigir, rodar mais uma semana de piloto e medir de novo. Não escalar com
critério vermelho.

### 1.5 Planilha de acompanhamento

| Semana | Gestor | Conta | Lotes | Itens publicados | % sem intervenção (SC-003) | Min/anúncio cronômetro (SC-005) | Min/anúncio SQL | Observações |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |

### Baseline manual (preencher no dia 0)

| Gestor | Anúncios | Minutos no processo manual | Min/anúncio |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |

## 2. Treinamento de 30 min (T100)

Uma sessão por turma de até 5 gestores, ao vivo, com a conta de teste aberta. Roteiro:

| Tempo | Bloco | Conteúdo |
|---|---|---|
| 0–3 min | Por que existe | Antes: tela por tela no Ads Manager. Agora: briefing → grade → publicar pausado. O que **não** muda: quem ativa, quem define orçamento e público continua sendo o gestor |
| 3–6 min | Regras que o produto impõe | Tudo nasce `PAUSED`; a IA só sugere dados, nunca executa; existe teto diário por conta; toda ação fica na auditoria |
| 6–11 min | Criativos (`/criativos`) | Importar pasta do Drive ou arrastar arquivos; o que é rejeitado e por quê (proporção, < 600 px, vídeo fora do limite, vídeo fora do H.264 — reexportar); o mesmo arquivo nunca sobe duas vezes. O card do vídeo toca no lugar e o aviso aparece junto, sem impedir o anúncio |
| 11–19 min | Montar o lote (`/lotes/novo`) | Escolher cliente e conta, colar briefing, **Gerar plano**; editar a grade; campos "Pendente" bloqueiam a publicação — a IA não inventa URL; modo manual dá o mesmo resultado |
| 19–24 min | Validar e publicar (`/lotes/[id]`) | Erro bloqueia, aviso não; a confirmação pede a contagem exata de itens; acompanhar as etapas; abrir o item no Ads Manager pelo link |
| 24–28 min | Quando dá errado | Ler a mensagem traduzida + "detalhes"; corrigir e reprocessar **só** o item que falhou; o que significa "Aguardando (rate limit da conta)"; quando chamar o admin (conexão em "Requer atenção") |
| 28–30 min | Combinados | Onde pedir ajuda, como reportar erro de tradução da Meta (vira entrada em `docs/erros-meta.md`), e o lembrete: **ativar anúncio continua sendo decisão humana no Ads Manager** |

Material de apoio: o briefing de exemplo de `specs/001-mvp-publicacao-lote/quickstart.md` §4 e a
tabela de `docs/erros-meta.md`.

## 3. Rollout às 17 contas (T100)

Ordem por risco crescente. Cada onda só começa quando a anterior fecha uma semana limpa
(sem incidente, sem duplicata, SC-003 mantido).

| Onda | Contas | Quando | Pré-requisito |
|---|---|---|---|
| 0 — piloto | 3 | semanas 1–2 | critérios da §1.4 verdes |
| 1 | +4 contas de perfil parecido com as do piloto | semana 3 | treinamento feito para os gestores dessas contas |
| 2 | +5 contas | semana 4 | Full access aprovado (`META_TIER=full`) ou volume comprovadamente cabendo em concorrência 1 |
| 3 | +5 contas restantes (total 17) | semana 5 | onda 2 sem incidente por 5 dias úteis |

Checklist por conta antes de entrar numa onda:

- [ ] Conta sincronizada e conexão `active` em `/contas`.
- [ ] Página, Instagram e pixel padrão definidos na conta.
- [ ] Cliente da conta com template de nomenclatura, UTM padrão e domínios de destino configurados.
- [ ] Teto diário coerente com o volume real da conta.
- [ ] Gestor responsável treinado e com escopo da conta em `/usuarios`.
- [ ] Um lote pequeno (3 a 5 anúncios) publicado e conferido no Ads Manager antes do primeiro lote
      grande.

### Métricas O1–O6 no painel (PRD §objetivos)

| Objetivo | Métrica | Meta | Fonte no produto |
|---|---|---|---|
| O1 | Minutos de gestor por anúncio publicado | ≤ 0,75 min | consulta de SC-005 (§1.2) + cronômetro |
| O2 | % de anúncios do lote publicados sem intervenção | ≥ 98 % | consulta de SC-003 (§1.2) |
| O3 | % de anúncios reprovados na revisão da Meta | −30 % vs. baseline | `ad_drafts.effective_status = 'DISAPPROVED'` / `review_feedback`, alimentado pelo poller a cada 10 min |
| O4 | % das subidas da operação feitas via AdPub | ≥ 80 % | anúncios criados no AdPub (`ad_drafts` publicados) ÷ total criado nas contas (conferido no Ads Manager) |
| O5 | % de ações com trilha de auditoria | 100 % | `audit_log` / `/auditoria` |
| O6 | Incidentes de token/credencial exposta | 0 | scan de segredos do CI (gitleaks) + `mask()`/`redact()` em `packages/crypto` |

O3 e O4 exigem um número de fora do produto (o baseline do Ads Manager); os outros quatro saem
inteiros do banco.

### Critérios de parada do rollout

Parar de escalar e resolver antes de seguir se, em qualquer onda, acontecer:

- qualquer objeto duplicado na Meta (Constituição III);
- qualquer anúncio nascendo diferente de `PAUSED` (Constituição II);
- token exposto em log, resposta de API ou auditoria (Constituição IV);
- SC-003 abaixo de 95 % por uma semana inteira;
- mais de uma conta por semana entrando em `needs_attention` por motivo evitável.

### Ondas 009 — áreas novas (SPEC-002..009)

Flags `FEATURE_AI_ANALYSIS`/`FEATURE_REPORTS`/`FEATURE_INSIGHTS` ligam por
ambiente (rollback = desligar + revert). Ordem, uma onda por vez:

1. Insights em 3 contas do piloto (observar `consecutive_failures` e
   `GET /ops/metrics`).
2. Relatórios + performance nas mesmas 3 (conferir `capability-matrix.md`).
3. Inteligência + aprendizados (revisar 2 relatórios com gestores).
4. Alertas dedup + fadiga (forçar 1 incidente sintético por regra).
5. Expandir por ondas iguais às do publicador. Critérios de parada acima
   valem para todas as áreas; alerta informacional nunca autoriza automação.
