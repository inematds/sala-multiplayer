# Sala Multiplayer

[![Sala Multiplayer](guia/assets/banner-en.jpg)](https://inematds.github.io/sala-multiplayer/guia/en/)

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

People, AI agents (Claude Code and Codex) and Telegram talking in the same room, with a dashboard that shows everything live.

## What it is

Sala Multiplayer is a small program that runs on your computer and puts you (or your team), two AI agents (Claude Code and Codex) and whoever writes to your Telegram bot into one conversation. It is for people who want to work with agents alongside other people, or to set up a support desk where the AI drafts and a human approves before the reply goes out. The agents run on your subscription, with no API. To use it, you need Node 24 and the Claude Code and Codex CLIs installed and logged in.

It has two ready-made modes: **pessoa** (personal: you and your agents) and **atendimento** (support: a desk that serves customers on Telegram, with a human approving each reply before it goes out). It is the first practical version of the [Multiplayer Agentic](https://inematds.github.io/multiplayer-agentic/guia/) concept.

## 📖 User guide

Full guide (landing + step by step): **https://inematds.github.io/sala-multiplayer/guia/en/**

## The screens

| Screen | What it shows |
|---|---|
| **Room** (`/`) | On top: messages from the last hour, agents working, pending approvals and replies today. On the left: participants (All, People, Agents, Tools); click to filter. In the middle: the chat, with a conversation selector, all in one column; each message has an avatar and a colored border (yours white, people yellow, agents blue, system red). On the right: **Topics** (under debate on top; decided and stalled ones folded). Clicking a topic filters the chat and opens the **summary** on top: summary, decided, pending, who took part, cost and "See the flow". On a phone, Conversation and Topics become tabs. |
| **Graph** (`/grafo`) | Who talks to whom. The line gets thicker with volume and a dot runs along it with each message. |
| **Flow** (`/fluxo`) | A **Text \| Visual \| Graph** switch. Text: everything that comes in and goes out, in the order it happens (the **All** button turns every filter back on). Visual: one round per message from a person, as a sequence diagram (one column per participant, one arrow per message, marks for proposal, limit, failure and "just confirms"), with the resolution strip beside it: request, proposals, decided, pending, limits hit and cost. Graph: the round as circles with arrows numbered in step order and, beside it, the graph of the **whole topic** (how many messages went through each arrow). In Visual and Graph, **Open all** opens every round. |
| **Config** (`/config`) | Limits for the room, each agent and guests; switch guests on and off. Owner only, with the password. |

![Room](docs/sala-1280.png)
![Graph](docs/grafo-1280.png)

## Run it

```bash
git clone https://github.com/inematds/sala-multiplayer && cd sala-multiplayer
npm run demo          # demo with fake agents (starts clean, own folder): http://127.0.0.1:4601
npm test              # 46 tests, no agents or Telegram called
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
5. Anyone who does not know their id sends `ping` to the bot: they get the id back, and the owner gets a notice with the ready command (`/entrar <id> <person>`) to add them to the room without touching `.env`.
6. **Guest without an id:** the person sends `/entrar` to the bot (in a private chat). The owner gets "Request 7: Ana (@ana) wants to join. /aceitar 7 or /recusar 7", and the same request shows up under pending approvals in the panel (accepting asks for the owner password). The id stays inside the room. A guest chats and calls the agents but approves nothing and changes no settings, and has a daily reply cap of their own (30). To switch a guest off: `/remover ana` on Telegram or the button on the Config page; the guest can leave with `/sair`. To come back, they send `/entrar` again and the owner approves again.
7. Run `npm run pessoa` or `npm run atendimento`. The Telegram badge at the top of the dashboard shows "on".

It is **a single bot**: the agents reply through it, with their name in front ("Claude: ..."). This is needed because a Telegram bot cannot see messages from another bot.

## How it works

- **Calling an agent:** write `@claude` or `@codex`. Between agents only an `@id` at the start of a sentence counts ("@codex, can you check this?"); naming an agent mid-sentence ("the owner still has to approve @critico") calls no one. A reply that only confirms ("agreed, waiting for the owner") calls no one and gets a "just confirms" tag. An agent only calls back the one who spoke to it when it asks a question. Without a mention, the profile's route applies: in pessoa mode it goes to Claude; in atendimento, a customer message goes to Claude and team conversation stays between people.
- **Calling everyone:** `@todos` calls every agent in the room (except the topic organizer) for its opinion. Owner and team only; a guest falls back to the normal route. Each agent uses one reply and counts toward the per-message cap.
- **Groups:** ask in the chat "create the group @games with the critic and codex". The agent proposes and only the owner approves (same approval screen). Then `@games` calls its members. Changing and deleting also happen by asking in the chat. Stored in `data/<profile>/grupos.json`. Owner and team only.
- **Tools:** the agent asks with one line `FERRAMENTA: nome | entrada`; the room runs it and returns the result. Examples: `base` (answer base in `perfis/base-atendimento.md`), `chamado` (ticket), `notas` (notes), `hora` (time).
- **Approval:** in atendimento, the reply to the customer becomes a draft. It only goes out after someone on the team approves it in the dashboard (you can edit it first) or sends `/aprovar N` on Telegram.
- **Limits:** up to 10 turns in a row between agents (6 in atendimento), up to 12 agent replies per message adding up every branch (8 in atendimento), a daily reply limit (400 and 300), a cap per guest and, optionally, a cap per agent. They prevent loops that burn through your subscription. The limit notice shows once per message. Change them on the Config page.
- **Round:** each message from a person opens a round; everything it triggers keeps its id (`rodada`) and the event that triggered it (`pai`).
- **Model, effort and reply length:** each agent has `nivel` (super, topo, executor, menor; each level's model comes from `~/.config/inema/modelos.env`), `esforco` (empty = the level's own, or low, medium, high, xhigh) and `linhas_max`. Set them in the profile or, for a new agent, right on the approval card.
- **Security:** the dashboard only opens on this machine (`127.0.0.1`). A message from another person is treated as data, never as an order. In pessoa mode, the bot ignores anyone who is not the owner. The agents run without the CLI's own tools, without MCP and in an empty folder.

## New agent on request

Ask in the conversation, for example: "create an agent that proofreads my texts". Claude does not create anything: it returns a **proposal** (name, role, way of working, engine, tools and a daily reply cap). The room checks the proposal and works out the cost and the time per reply, measured on previous replies. The proposal shows up under pending approvals, and the agent only joins after an approver of the profile approves it (in the panel or with `/aprovar N` on Telegram). A customer message never creates a proposal.

Approved agents are kept in `data/<perfil>/agentes.json` (outside git). To remove one, delete its entry and restart the room. In the panel, each agent shows how many replies it gave today and its average time per reply.

## Topics

After each message, the room puts the conversation into a topic. Without the organizer agent, it joins consecutive messages of the same conversation (up to 15 minutes apart) into a topic with no written summary; proposals, approvals and cost still show, because the room already records them. With the **@topicos** agent approved (ask "create an agent that organizes the conversation into topics"; its id must be `topicos`, or change `agente_topicos` in the profile), it writes the title, summary, decided and pending items, and picks between updating an open topic or opening a new one. Each summary counts as one reply against the daily limit. Topics live in the room database (`data/<perfil>/sala.db`).

## Settings: only the owner changes them

The limits (turns between agents, replies per message, replies per day, reply length, guest rules: daily cap, whether a returning guest needs a new approval, whether the invite expires) and each agent's model, effort and cap live on the **Config** page (`/config`). Changing them needs the **owner password** (`SALA_DONO_SENHA` in `.env`). On Telegram, the owner uses `/config` to see them and `/config teto_turnos 20` (or `/config agente.claude.nivel super`) to change them, recognized by their Telegram id. Anyone else asks in the chat ("raise the cap to 20"): the agent builds a proposal and only the owner approves it. Changes apply at once and are stored in `data/<perfil>/config.json`, on top of the profile. Each profile's owner is the `"dono"` field in its JSON.

## Profiles

`perfis/pessoa.json` and `perfis/atendimento.json` define who takes part, each agent's role and personality, the tools, the default route, who approves and the limits. To create a new desk, copy a profile and run `node server.mjs --perfil <name>`.

## Next steps

See [ROADMAP.md](ROADMAP.md) (in Portuguese): a new tool on request (with two approvals) and the **councils** from [7conselho](https://github.com/inematds/7conselho) as participants in the room.

---

[INEMA.CLUB](https://inema.club) · MIT License
