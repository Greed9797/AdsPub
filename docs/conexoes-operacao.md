# Conexões: causas, estados e ação do operador (SPEC-001)

Token nunca aparece em tela, log, fila ou auditoria — só `mask()`.

| Causa | Estado | Jobs | Ação do operador |
|---|---|---|---|
| Token inválido/expirado (190) | `needs_attention` + `last_error` | contas pausadas 1h; publish recusa; sync marca e termina | Testar; se falhar, **Trocar token** em `/contas` |
| Permissão revogada na BM | `needs_attention` | publish recusa antes de qualquer create (T-001-1); sync pula sem girar | Reatribuir ativos ao System User, Testar |
| Ativo inacessível (conta/página removida) | sync falha no item, conexão segue `active` | só aquele ativo some do cache | Reatribuir ou remover padrões da conta |
| Quota/rate limit (613, teto 75%) | conta `paused_until`, conexão `active` | fila da conta pausa até o tempo informado | Aguardar; `Full access` se recorrente |
| Rede/timeout no sync | conexão segue `active`, erro fica em `last_error` | job repete (até 6 tentativas) e o ciclo de 6h tenta de novo; nada pausado | Observar; só agir se `last_error` persistir 2 ciclos |

Rotação de token: `/contas` → **Trocar token** (testa antes de salvar; token
ruim nem entra). Testar ou trocar token com sucesso reativa a conexão e libera
a pausa das contas dela — sync manual só é aceito com a conexão `active` (409
enquanto estiver em `needs_attention`).
Auditoria: `connection.create|test|needs_attention|rotate`.

Ciclo periódico: um agendador por conexão (`sync:<id>`), reconciliado a cada
10 min. Conexão nova entra no ciclo sem reiniciar o worker; conexão apagada ou
revogada perde o agendador.

Inventário (contas, páginas, IG, pixels, campanhas, conjuntos) atualiza em dois
momentos: **Sincronizar** em `/contas` e o ciclo de 6h. Cadastrar, testar ou
trocar token **não** sincroniza — valida a credencial e libera a conexão. Depois
de voltar de `needs_attention`, sincronize para não trabalhar com cache velho.
