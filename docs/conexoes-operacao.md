# Conexões: causas, estados e ação do operador (SPEC-001)

Token nunca aparece em tela, log, fila ou auditoria — só `mask()`.

| Causa | Estado | Jobs | Ação do operador |
|---|---|---|---|
| Token inválido/expirado (190) | `needs_attention` + `last_error` | contas pausadas 1h; publish recusa; sync marca e termina | Testar; se falhar, **Trocar token** em `/contas` |
| Permissão revogada na BM | `needs_attention` | publish recusa antes de qualquer create (T-001-1); sync pula sem girar | Reatribuir ativos ao System User, Testar |
| Ativo inacessível (conta/página removida) | sync falha no item, conexão segue `active` | só aquele ativo some do cache | Reatribuir ou remover padrões da conta |
| Quota/rate limit (613, teto 75%) | conta `paused_until`, conexão `active` | fila da conta pausa até o tempo informado | Aguardar; `Full access` se recorrente |
| Rede/timeout no sync | `needs_attention` + retry no próximo ciclo (6h) | nada pausado | Observar; só agir se repetir 2 ciclos |

Rotação de token: `/contas` → **Trocar token** (testa antes de salvar; token
ruim nem entra). Auditoria: `connection.create|test|needs_attention|rotate`.
