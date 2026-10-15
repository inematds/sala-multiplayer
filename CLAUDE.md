# CLAUDE.md — sala-multiplayer

Sala onde pessoas, agentes de IA (Claude Code e Codex, sempre pela assinatura, nunca API) e o Telegram conversam, com painel ao vivo (Sala, Grafo, Fluxo). Repo `inematds/sala-multiplayer`, autor `inematds <inematds@gmail.com>`. Conceito por trás: `~/projetos/multiplayer-agentic`.

- Zero dependências: Node 24 (`node:sqlite`, `fetch`, SSE). Não adicionar pacote sem motivo forte.
- Perfis em `perfis/*.json` (pessoa, atendimento). Mudança de comportamento por perfil vai no JSON, não em `if` no código.
- Tetos (turnos entre agentes, respostas por dia) e aprovação humana ficam em `lib/sala.mjs`, nunca dentro do agente.
- Testes: `npm test` (motor falso, não chama CLI nem Telegram). `tools/fumaca.mjs` chama os agentes reais (gasta assinatura).
- Telas: `NODE_PATH=~/.npm-global/lib/node_modules node tools/checar.cjs <url>` com o servidor no ar (`npm run demo`).
- Segredos só no `.env` (fora do git). Nunca imprimir o token.
- v0.2 planejada: conselhos do `~/projetos/7conselho` como participantes (ver ROADMAP.md).

## Self-learning

Quando o Nei corrigir, ou eu perceber um erro: antes de continuar, gravar a lição como regra de uma linha no TOPO de `LESSONS.md`.

## Lessons

Ver [LESSONS.md](LESSONS.md).
