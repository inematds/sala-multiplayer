# Sala Multiplayer

[![Sala Multiplayer](guia/assets/banner-en.jpg)](https://inematds.github.io/sala-multiplayer/guia/en/)

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

People, AI agents (Claude Code and Codex) and Telegram talking in the same room, with a dashboard that shows everything live.

## What it is

Sala Multiplayer is a small program that runs on your computer and puts you (or your team), two AI agents (Claude Code and Codex) and whoever writes to your Telegram bot into one conversation. It is for people who want to work with agents alongside other people, or to set up a support desk where the AI drafts and a human approves before the reply goes out. The agents run on your subscription, with no API. To use it, you need Node 24 and the Claude Code and Codex CLIs installed and logged in.

It has two ready-made modes: **pessoa** (personal: you and your agents) and **atendimento** (support: a desk that serves customers on Telegram, with a human approving each reply before it goes out). It is the first practical version of the [Multiplayer Agentic](https://inematds.github.io/multiplayer-agentic/guia/) concept.

## 📖 User guide

Full guide (landing + step by step): **https://inematds.github.io/sala-multiplayer/guia/en/**

## The three screens

| Screen | What it shows |
|---|---|
| **Room** (`/`) | On top: messages from the last hour, agents working, pending approvals and replies today. On the left: participants (All, People, Agents, Tools); click to filter. On the right: the chat, with a conversation selector. |
| **Graph** (`/grafo`) | Who talks to whom. The line gets thicker with volume and a dot runs along it with each message. |
| **Flow** (`/fluxo`) | Everything that comes in and goes out, scrolling in the order it happens. |

![Room](docs/sala-1280.png)
![Graph](docs/grafo-1280.png)

## Run it

```bash
git clone https://github.com/inematds/sala-multiplayer && cd sala-multiplayer
npm run demo          # demo with fake agents: http://127.0.0.1:4601
npm test              # 11 tests, no agents or Telegram called
```

With real agents:

```bash
npm run pessoa        # you and your agents   → http://127.0.0.1:4600
npm run atendimento   # support desk          → http://127.0.0.1:4600
```

## Connect Telegram

1. On Telegram, talk to **@BotFather**: `/newbot`, pick a name and copy the token.
2. For the bot to read group messages: in @BotFather, `/setprivacy` → pick the bot → **Disable**.
3. Copy `.env.exemplo` to `.env` and fill in `SALA_TELEGRAM_TOKEN` and your id (`SALA_DONO_TELEGRAM_ID`; find it with @userinfobot).
4. Each team member sends `/start` to the bot once (a Telegram bot cannot start a conversation; without it, it cannot notify people about approvals).
5. Run `npm run pessoa` or `npm run atendimento`. The Telegram badge at the top of the dashboard shows "on".

It is **a single bot**: the agents reply through it, with their name in front ("Claude: ..."). This is needed because a Telegram bot cannot see messages from another bot.

## How it works

- **Calling an agent:** write `@claude` or `@codex`. Without a mention, the profile's route applies: in pessoa mode it goes to Claude; in atendimento, a customer message goes to Claude and team conversation stays between people.
- **Tools:** the agent asks with one line `FERRAMENTA: nome | entrada`; the room runs it and returns the result. Examples: `base` (answer base in `perfis/base-atendimento.md`), `chamado` (ticket), `notas` (notes), `hora` (time).
- **Approval:** in atendimento, the reply to the customer becomes a draft. It only goes out after someone on the team approves it in the dashboard (you can edit it first) or sends `/aprovar N` on Telegram.
- **Limits:** up to 4 turns in a row between agents (3 in atendimento) and a daily reply limit. Both prevent loops that burn through your subscription.
- **Security:** the dashboard only opens on this machine (`127.0.0.1`). A message from another person is treated as data, never as an order. In pessoa mode, the bot ignores anyone who is not the owner. The agents run without the CLI's own tools, without MCP and in an empty folder.

## New agent on request

Ask in the conversation, for example: "create an agent that proofreads my texts". Claude does not create anything: it returns a **proposal** (name, role, way of working, engine, tools and a daily reply cap). The room checks the proposal and works out the cost and the time per reply, measured on previous replies. The proposal shows up under pending approvals, and the agent only joins after an approver of the profile approves it (in the panel or with `/aprovar N` on Telegram). A customer message never creates a proposal.

Approved agents are kept in `data/<perfil>/agentes.json` (outside git). To remove one, delete its entry and restart the room. In the panel, each agent shows how many replies it gave today and its average time per reply.

## Profiles

`perfis/pessoa.json` and `perfis/atendimento.json` define who takes part, each agent's role and personality, the tools, the default route, who approves and the limits. To create a new desk, copy a profile and run `node server.mjs --perfil <name>`.

## Next steps

See [ROADMAP.md](ROADMAP.md) (in Portuguese). In v0.2 the **councils** from [7conselho](https://github.com/inematds/7conselho) join as participants in the room.

---

[INEMA.CLUB](https://inema.club) · MIT License
