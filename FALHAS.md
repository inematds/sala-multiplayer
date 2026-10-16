# FALHAS

| data | o que quebrou | menor correção | prompt \| infra |
|---|---|---|---|
| 2026-10-16 | uma mensagem do dono gerou 20 respostas de agentes ("combinado"/"aguardo" em laço; teto contado por ramo; @ citado no meio da frase acordava agente) | teto por rodada + @ só no começo da frase + eco não chama ninguém | prompt |
| 2026-10-15 | revisor (Codex) não via o rascunho aguardando aprovação | incluir tipo rascunho no histórico do prompt | prompt |
| 2026-10-15 | mensagem do dono pelo Telegram voltaria como eco ("Dono: ...") | receber() recebe via=painel|telegram e só repassa o que veio do painel | prompt |
