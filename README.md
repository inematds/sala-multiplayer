# Sala multiplayer

[![Sala Multiplayer](guia/assets/banner.jpg)](https://inematds.github.io/sala-multiplayer/guia/)

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

Pessoas, agentes de IA (Claude Code e Codex) e o Telegram conversando na mesma sala, com um painel que mostra tudo ao vivo.

## O que é

A Sala Multiplayer é um programa pequeno que roda no seu computador e junta numa conversa só você (ou sua equipe), dois agentes de IA (Claude Code e Codex) e quem escreve para o seu bot do Telegram. Serve para quem quer trabalhar com agentes junto de outras pessoas, ou montar um atendimento em que a IA rascunha e um humano aprova antes de a resposta sair. Os agentes rodam pela sua assinatura, sem API. Para usar, você precisa de Node 24 e dos CLIs do Claude Code e do Codex instalados e logados.

Tem dois modos prontos: **pessoa** (você e seus agentes) e **atendimento** (um setor que atende clientes pelo Telegram, com um humano aprovando cada resposta antes de ela sair). É a primeira versão prática do conceito [Multiplayer Agentic](https://inematds.github.io/multiplayer-agentic/guia/).

## 📖 Guia de uso

Guia completo (landing + passo a passo): **https://inematds.github.io/sala-multiplayer/guia/**

## As três telas

| Tela | O que mostra |
|---|---|
| **Sala** (`/`) | No topo: mensagens da última hora, agentes trabalhando, aprovações pendentes e respostas do dia. À esquerda: participantes (Todos, Pessoas, Agentes, Ferramentas); clique para filtrar. À direita: o chat, com seletor de conversa. |
| **Grafo** (`/grafo`) | Quem conversa com quem. A linha engrossa com o volume e uma bolinha corre por ela a cada mensagem. |
| **Fluxo** (`/fluxo`) | Tudo o que entra e sai, rolando na ordem em que acontece. |

![Sala](docs/sala-1280.png)
![Grafo](docs/grafo-1280.png)

## Rodar

```bash
git clone https://github.com/inematds/sala-multiplayer && cd sala-multiplayer
npm run demo          # demonstração com agentes falsos: http://127.0.0.1:4601
npm test              # 11 testes, sem chamar agentes nem Telegram
```

Com agentes de verdade:

```bash
npm run pessoa        # você e seus agentes   → http://127.0.0.1:4600
npm run atendimento   # setor de atendimento  → http://127.0.0.1:4600
```

## Ligar o Telegram

1. No Telegram, fale com o **@BotFather**: `/newbot`, escolha o nome e copie o token.
2. Para o bot ler mensagens em grupo: no @BotFather, `/setprivacy` → escolha o bot → **Disable**.
3. Copie `.env.exemplo` para `.env` e preencha `SALA_TELEGRAM_TOKEN` e seu id (`SALA_DONO_TELEGRAM_ID`; descubra com o @userinfobot).
4. Cada pessoa da equipe manda `/start` para o bot uma vez (bot do Telegram não pode puxar conversa; sem isso ele não consegue avisar das aprovações).
5. Rode `npm run pessoa` ou `npm run atendimento`. O selo do Telegram no topo do painel fica "ligado".

É **um bot só**: os agentes respondem por ele, com o nome na frente ("Claude: ..."). Isso é necessário porque um bot do Telegram não enxerga mensagens de outro bot.

## Como funciona

- **Chamar agente:** escreva `@claude` ou `@codex`. Sem menção, vale a rota do perfil: no modo pessoa vai para o Claude; no atendimento, mensagem de cliente vai para o Claude e conversa da equipe fica só entre pessoas.
- **Ferramentas:** o agente pede com uma linha `FERRAMENTA: nome | entrada`; a sala roda e devolve o resultado. Exemplos: `base` (base de respostas em `perfis/base-atendimento.md`), `chamado`, `notas`, `hora`.
- **Aprovação:** no atendimento, a resposta para o cliente vira rascunho. Ela só sai depois que alguém da equipe aprova no painel (dá para editar antes) ou manda `/aprovar N` no Telegram.
- **Tetos:** até 10 turnos seguidos entre agentes (6 no atendimento), um limite de respostas por dia (400 e 300) e, se quiser, um teto por agente. Evitam laço gastando a assinatura. Mude em `perfis/<perfil>.json` (`teto_turnos`, `teto_diario`).
- **Modelo, esforço e tamanho da resposta:** cada agente tem `nivel` (super, topo, executor, menor; o modelo de cada nível vem de `~/.config/inema/modelos.env`), `esforco` (vazio = o do nível, ou low, medium, high, xhigh) e `linhas_max`. Defina no perfil ou, para agente novo, no próprio cartão de aprovação.
- **Segurança:** o painel só abre nesta máquina (`127.0.0.1`). Mensagem de outra pessoa é tratada como dado, nunca como ordem. No modo pessoa, o bot ignora quem não é o dono. Os agentes rodam sem as ferramentas próprias do CLI, sem MCP e numa pasta vazia.

## Agente novo por pedido

Peça na conversa, por exemplo: "cria um agente que revise meus textos". O Claude não cria nada: ele devolve uma **proposta** (nome, papel, jeito de trabalhar, motor, ferramentas e teto de respostas por dia). A sala confere a proposta e calcula o custo e o tempo por resposta, medidos nas respostas anteriores. A proposta aparece em "Aprovações pendentes", e o agente só entra depois que um aprovador do perfil aprovar (no painel ou com `/aprovar N` no Telegram). Mensagem de cliente nunca gera proposta.

Os agentes aprovados ficam em `data/<perfil>/agentes.json` (fora do git). Para tirar um, apague a entrada e reinicie a sala. No painel, cada agente mostra quantas respostas deu hoje e o tempo médio por resposta.

## Configuração: só o dono muda

Os limites (turnos entre agentes, respostas por dia, tamanho da resposta) e o modelo, o esforço e o teto de cada agente ficam na tela **Config** (`/config`). Mudar exige a **senha do dono** (`SALA_DONO_SENHA` no `.env`). No Telegram, o dono usa `/config` para ver e `/config teto_turnos 20` (ou `/config agente.claude.nivel super`) para mudar, reconhecido pelo id dele. Quem não é o dono pede no chat ("aumenta o teto para 20"): o agente monta uma proposta e só o dono aprova. As mudanças valem na hora e ficam em `data/<perfil>/config.json`, por cima do perfil. O dono de cada perfil é o campo `"dono"` do JSON.

## Perfis

`perfis/pessoa.json` e `perfis/atendimento.json` definem quem participa, o papel e a personalidade de cada agente, as ferramentas, a rota padrão, quem aprova e os tetos. Para criar um setor novo, copie um perfil e rode `node server.mjs --perfil <nome>`.

## Próximos passos

Veja o [ROADMAP.md](ROADMAP.md). Na v0.2 entram os **conselhos** do [7conselho](https://github.com/inematds/7conselho) como participantes da sala.

---

[INEMA.CLUB](https://inema.club) · Licença MIT
