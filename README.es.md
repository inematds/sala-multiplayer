# Sala multiplayer

[![Sala Multiplayer](guia/assets/banner-es.jpg)](https://inematds.github.io/sala-multiplayer/guia/es/)

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

Personas, agentes de IA (Claude Code y Codex) y Telegram conversando en la misma sala, con un panel que muestra todo en vivo.

## Qué es

Sala Multiplayer es un programa pequeño que corre en tu computadora y reúne en una sola conversación a ti (o a tu equipo), dos agentes de IA (Claude Code y Codex) y a quien escribe a tu bot de Telegram. Sirve para quien quiere trabajar con agentes junto con otras personas, o armar una atención al cliente en la que la IA redacta un borrador y un humano lo aprueba antes de que la respuesta salga. Los agentes corren con tu suscripción, sin API. Para usarla necesitas Node 24 y los CLI de Claude Code y de Codex instalados y con sesión iniciada.

Tiene dos modos listos: **pessoa** (personal: tú y tus agentes) y **atendimento** (atención al cliente: un área que atiende clientes por Telegram, con un humano aprobando cada respuesta antes de que salga). Es la primera versión práctica del concepto [Multiplayer Agentic](https://inematds.github.io/multiplayer-agentic/guia/).

## 📖 Guía de uso

Guía completa (landing + paso a paso): **https://inematds.github.io/sala-multiplayer/guia/es/**

## Las tres pantallas

| Pantalla | Qué muestra |
|---|---|
| **Sala** (`/`) | Arriba: mensajes de la última hora, agentes trabajando, aprobaciones pendientes y respuestas del día. A la izquierda: participantes (Todos, Pessoas, Agentes, Ferramentas); haz clic para filtrar. A la derecha: el chat, con selector de conversación. |
| **Grafo** (`/grafo`) | Quién conversa con quién. La línea se engrosa con el volumen y una bolita corre por ella con cada mensaje. |
| **Flujo** (`/fluxo`) | Todo lo que entra y sale, desplazándose en el orden en que ocurre. |

![Sala](docs/sala-1280.png)
![Grafo](docs/grafo-1280.png)

## Ejecutar

```bash
git clone https://github.com/inematds/sala-multiplayer && cd sala-multiplayer
npm run demo          # demostración con agentes falsos: http://127.0.0.1:4601
npm test              # 11 pruebas, sin llamar a agentes ni a Telegram
```

Con agentes de verdad:

```bash
npm run pessoa        # tú y tus agentes      → http://127.0.0.1:4600
npm run atendimento   # área de atención      → http://127.0.0.1:4600
```

## Conectar Telegram

1. En Telegram, habla con **@BotFather**: `/newbot`, elige el nombre y copia el token.
2. Para que el bot lea mensajes en un grupo: en @BotFather, `/setprivacy` → elige el bot → **Disable**.
3. Copia `.env.exemplo` a `.env` y completa `SALA_TELEGRAM_TOKEN` y tu id (`SALA_DONO_TELEGRAM_ID`; averígualo con @userinfobot).
4. Cada persona del equipo envía `/start` al bot una vez (un bot de Telegram no puede iniciar la conversación; sin eso no puede avisar de las aprobaciones).
5. Ejecuta `npm run pessoa` o `npm run atendimento`. El sello de Telegram en la parte superior del panel queda "ligado" (activo).

Es **un solo bot**: los agentes responden por él, con su nombre al frente ("Claude: ..."). Es necesario porque un bot de Telegram no ve los mensajes de otro bot.

## Cómo funciona

- **Llamar a un agente:** escribe `@claude` o `@codex`. Sin mención, vale la ruta del perfil: en el modo pessoa va a Claude; en atendimento, el mensaje de un cliente va a Claude y la conversación del equipo queda solo entre personas.
- **Herramientas:** el agente la pide con una línea `FERRAMENTA: nome | entrada`; la sala la ejecuta y devuelve el resultado. Ejemplos: `base` (base de respuestas en `perfis/base-atendimento.md`), `chamado`, `notas`, `hora`.
- **Aprobación:** en atendimento, la respuesta para el cliente queda como borrador. Solo sale cuando alguien del equipo la aprueba en el panel (puede editarla antes) o envía `/aprovar N` por Telegram.
- **Topes:** hasta 10 turnos seguidos entre agentes (6 en atendimento), un límite de respuestas por día (400 y 300) y, si quieres, un tope por agente. Evitan bucles que gasten la suscripción. Cámbialos en `perfis/<perfil>.json` (`teto_turnos`, `teto_diario`).
- **Modelo, esfuerzo y largo de la respuesta:** cada agente tiene `nivel` (super, topo, executor, menor; el modelo de cada nivel sale de `~/.config/inema/modelos.env`), `esforco` (vacío = el del nivel, o low, medium, high, xhigh) y `linhas_max`. Defínelos en el perfil o, para un agente nuevo, en la misma tarjeta de aprobación.
- **Seguridad:** el panel solo abre en esta máquina (`127.0.0.1`). El mensaje de otra persona se trata como dato, nunca como orden. En el modo pessoa, el bot ignora a quien no es el dueño. Los agentes corren sin las herramientas propias del CLI, sin MCP y en una carpeta vacía.

## Agente nuevo a pedido

Pídelo en la conversación, por ejemplo: "crea un agente que revise mis textos". Claude no crea nada: devuelve una **propuesta** (nombre, rol, forma de trabajar, motor, herramientas y tope de respuestas por día). La sala revisa la propuesta y calcula el costo y el tiempo por respuesta, medidos en las respuestas anteriores. La propuesta aparece en las aprobaciones pendientes, y el agente solo entra después de que un aprobador del perfil la apruebe (en el panel o con `/aprovar N` en Telegram). Un mensaje de cliente nunca genera una propuesta.

Los agentes aprobados quedan en `data/<perfil>/agentes.json` (fuera de git). Para quitar uno, borra su entrada y reinicia la sala. En el panel, cada agente muestra cuántas respuestas dio hoy y su tiempo promedio por respuesta.

## Perfiles

`perfis/pessoa.json` y `perfis/atendimento.json` definen quién participa, el rol y la personalidad de cada agente, las herramientas, la ruta por defecto, quién aprueba y los topes. Para crear un área nueva, copia un perfil y ejecuta `node server.mjs --perfil <nombre>`.

## Próximos pasos

Mira el [ROADMAP.md](ROADMAP.md) (en portugués). En la v0.2 entran los **consejos** de [7conselho](https://github.com/inematds/7conselho) como participantes de la sala.

---

[INEMA.CLUB](https://inema.club) · Licencia MIT
