# Handoffs — trabalhos abertos

Cada linha é um assunto em andamento: leia o snapshot do assunto que for continuar. Gravado por handoff-grava.py.

<!-- handoff-indice:inicio -->
- `sala-multiplayer` · handoffs/history/2026-10-16T195141Z-sala-multiplayer.md · 16/10 16:51
<!-- handoff-indice:fim -->

---

Cópia integral do snapshot mais recente (handoffs/history/2026-10-16T195141Z-sala-multiplayer.md):

# Handoff — 2026-10-16 — sala no ar na VPS2; Claude da VPS parou (CLI velho + login expirado)

## Projeto e escopo
sala-multiplayer, raiz ~/projetos/sala-multiplayer. A sala roda só na VPS2 (salaconf.inema.pro, serviço sala@pessoa), com login do dono por usuário e senha e login INEMA.PRO (v0.12.5). Agentes só pela assinatura, nunca API.

## Objetivo atual
Fazer o Claude voltar a responder na sala da VPS. Está pronto quando `claude -p ok --model claude-opus-5-5` responder na VPS e uma mensagem @claude na sala tiver resposta.

## Estado aceito
- [confirmed] Erro do Nei às 14:07 UTC: "Claude falhou: unrecognized_model claude-opus-5-5". O CLI da VPS estava na 2.1.259 (aqui está na 2.1.302).
- [confirmed] O claude da VPS foi atualizado para a 2.1.301 com npm -g. O postinstall foi pulado (aviso allow-scripts), mas `--version` responde.
- [confirmed] O login OAuth do claude na VPS morreu: credentials com expiresAt 0, gravado às 14:07, e `claude auth status` dá loggedIn false.
- [confirmed] A Tiza entrou como convidada web (aprovação #5). O agente @topicos foi aprovado (#4).
- [confirmed] A linha da falha foi para o FALHAS.md (commit c14dfc8, enviado).

## Proposto / tentado, não confirmado
- [?] Saber se o postinstall pulado afeta alguma coisa. Conferir depois do login.

## Decisões e restrições
- No servidor, preferir o `claude setup-token` (token de longa duração da assinatura) em CLAUDE_CODE_OAUTH_TOKEN no .env da VPS, ou `claude auth login` feito pelo Nei. Exige ação interativa do Nei.

## Arquivos alterados
- `FALHAS.md` — linha do claude velho e do login expirado.
- Fora do projeto: na VPS2, o pacote global @anthropic-ai/claude-code passou para a 2.1.301.

## Memória e regras duráveis tocadas
- nenhuma

## Verificação
- Rodado: `claude --version` na VPS → 2.1.301
- Rodado: `claude -p "responda só: ok" --model claude-opus-5-5` na VPS → "Failed to authenticate: OAuth session expired"
- Rodado: `claude auth status` na VPS → loggedIn false
- Não rodado: teste do agente na sala, porque depende do login.

## Estado em execução
- Processos em segundo plano: nenhum
- Servidores / portas: sala@pessoa na VPS2 37.27.39.74, 127.0.0.1:4600, atrás do Caddy (salaconf.inema.pro)
- Worktrees / branches abertos: nenhum

## Perguntas abertas e adiados
- Aberta: o Nei logar o claude na VPS (auth login ou setup-token) e o codex (`codex login --device-auth`).
- Aberta: emails INEMA.PRO do dono e da Tiza para SALA_DONO_EMAIL e SALA_TIZA_EMAIL.
- Aberta: decidir se o convidado web vê a sala inteira ou só as próprias conversas.

## Próxima ação exata
Depois que o Nei logar: rodar `claude -p ok --model claude-opus-5-5` na VPS, reiniciar sala@pessoa e mandar um @claude de teste.

## Mapa de retomada
- `FALHAS.md` — falhas recentes
- `server.mjs` — login e rotas
- `lib/acesso.mjs` — verificador INEMA.PRO e sessões

## Checagem de compartilhamento
- Sem segredos, tokens, cookies ou senhas: sim. A senha do dono e os tokens ficam só no .env da VPS.
