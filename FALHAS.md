# FALHAS

| data | o que quebrou | menor correção | prompt \| infra |
|---|---|---|---|
| 2026-10-16 | na VPS o Claude falhou com unrecognized_model claude-opus-5-5 (CLI 2.1.259 velho) e o login OAuth expirou na mesma hora | atualizar o claude na VPS junto com o daqui + login de longa duração (setup-token) no servidor | infra |
| 2026-10-16 | /api/stream só abria depois de 25 s atrás do Caddy (Node segura o cabeçalho até o 1º write; o 1º write era o ping) | escrever ": ok" logo após o writeHead | infra |
| 2026-10-16 | uma mensagem do dono gerou 20 respostas de agentes ("combinado"/"aguardo" em laço; teto contado por ramo; @ citado no meio da frase acordava agente) | teto por rodada + @ só no começo da frase + eco não chama ninguém | prompt |
| 2026-10-15 | revisor (Codex) não via o rascunho aguardando aprovação | incluir tipo rascunho no histórico do prompt | prompt |
| 2026-10-15 | mensagem do dono pelo Telegram voltaria como eco ("Dono: ...") | receber() recebe via=painel|telegram e só repassa o que veio do painel | prompt |
