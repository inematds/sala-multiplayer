# LESSONS — sala-multiplayer

- Na VPS o claude entra com `claude setup-token` (token de 1 ano em CLAUDE_CODE_OAUTH_TOKEN no .env), não com login de sessão: o OAuth de sessão expirou sozinho e derrubou o agente. Atualizar o CLI da VPS junto com o local, senão o modelo novo vira unrecognized_model (16/10/2026).
- Agente que revisa precisa ver o rascunho pendente no histórico, marcado como "não enviado"; sem isso o Codex dizia que não havia resposta para revisar (15/10/2026).
