# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operadores de mídia em agência (gestor, coordenador, admin, leitor) publicam e revisam anúncios Meta em lote. Não são designers nem desenvolvedores: a UI fala português de operação, não jargão de API.

## Product Purpose

AdPub é o espaço interno da W3 para criar, revisar e publicar anúncios Meta em lote, com reconciliação, biblioteca de mídia, contas, clientes e auditoria. Sucesso é publicar certo, com verba e destino conferidos, sem sair para o Ads Manager no meio do fluxo.

## Positioning

Publicação em lote com revisão humana obrigatória antes de gastar verba — não um gerenciador de anúncios genérico e não um chat que publica sozinho.

## Operating Context

- App web Next.js (`apps/web`) + API Fastify + worker. Login corporativo (domínio permitido). Temas Claro / Escuro / Sistema.
- Vocabulário de tela em PT (lote, criativo, conjunto); slugs de API em inglês.
- Papéis: admin, coordinator, manager, viewer. Viewer não cria nem publica.
- MCP (Claude, ChatGPT, Grok, Cursor) lê o mesmo domínio; write de publicação é opt-in no consentimento.

## Capabilities and Constraints

- Lotes manuais ou com IA, itens com prévia, publicação confirmada, reconciliação.
- Biblioteca de mídia (upload, Drive, vídeo H.264). Contas Meta, clientes, saúde, performance, relatórios e usuários conforme flags/papéis.
- Sem claims de volume, clientes ou ROI. Sem copy inventada de campanha.

## Brand Commitments

- Nome: AdPub.
- Acento laranja `#ff5701` (identidade já no produto; não substituir por roxo Linear).
- Tom: direto, operacional, PT-BR para leigos. Controles nomeiam a ação.

## Evidence on Hand

- UI e fluxos em `apps/web/src`. HANDOFF.md descreve o estado operacional. Não há fotografia de marca, logotipo vetorial nem depoimento de cliente para usar na interface.

## Product Principles

1. A tarefa cabe na tela: filtrar, abrir, revisar, publicar.
2. Estado (status, conta, erro) é mais importante que decoração.
3. Publicar é irreversível o bastante para exigir confirmação explícita.
4. Palavras da operação vencem jargão de plataforma.
5. Densidade de ferramenta, não de landing.

## Accessibility & Inclusion

Contraste de texto ≥ 4.5:1. Alvos de toque ≥ 40px em controle primário. Foco visível. Português claro em erros, com o que aconteceu e o que fazer.
