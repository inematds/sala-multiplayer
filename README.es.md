# Sala multiplayer

[![Sala Multiplayer](guia/assets/banner-es.jpg)](https://inematds.github.io/sala-multiplayer/guia/es/)

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

Personas, agentes de IA (Claude Code y Codex) y Telegram conversando en la misma sala, con un panel que muestra todo en vivo.

## Qué es

Sala Multiplayer es un programa pequeño que corre en tu computadora y reúne en una sola conversación a ti (o a tu equipo), dos agentes de IA (Claude Code y Codex) y a quien escribe a tu bot de Telegram. Sirve para quien quiere trabajar con agentes junto con otras personas, o armar una atención al cliente en la que la IA redacta un borrador y un humano lo aprueba antes de que la respuesta salga. Los agentes corren con tu suscripción, sin API. Para usarla necesitas Node 24 y los CLI de Claude Code y de Codex instalados y con sesión iniciada.

Tiene dos modos listos: **pessoa** (personal: tú y tus agentes) y **atendimento** (atención al cliente: un área que atiende clientes por Telegram, con un humano aprobando cada respuesta antes de que salga). Es la primera versión práctica del concepto [Multiplayer Agentic](https://inematds.github.io/multiplayer-agentic/guia/).

## 📖 Guía de uso

Guía completa (landing + paso a paso): **https://inematds.github.io/sala-multiplayer/guia/es/**

## Las pantallas

| Pantalla | Qué muestra |
|---|---|
| **Sala** (`/`) | Arriba: mensajes de la última hora, agentes trabajando, aprobaciones pendientes y respuestas del día. A la izquierda: participantes (Todos, Pessoas, Agentes, Ferramentas); haz clic para filtrar. En el medio: el chat, con selector de conversación, todo en una columna; cada mensaje tiene avatar y borde de color (los tuyos en blanco, personas en amarillo, agentes en azul, sistema en rojo). A la derecha: **Temas** (en debate arriba; decididos y parados plegados). Al hacer clic en un tema, el chat se filtra y arriba se abre el **resumen**: resumen, decidido, pendiente, quién participó, costo y "Ver el flujo". En el celular, Conversación y Temas pasan a ser pestañas. |
| **Grafo** (`/grafo`) | Quién conversa con quién. La línea se engrosa con el volumen y una bolita corre por ella con cada mensaje. |
| **Flujo** (`/fluxo`) | Botón **Texto \| Visual \| Grafo**. Texto: todo lo que entra y sale, en el orden en que ocurre (el botón **Todos** vuelve a activar todos los filtros). Visual: una ronda por mensaje de una persona, en diagrama de secuencia (una columna por participante, una flecha por mensaje, marcas de propuesta, tope, falla y "solo confirma"), con la franja de resolución al lado: pedido, propuestas, decidido, pendiente, topes y costo. Grafo: la ronda en círculos con flechas numeradas por el orden de los pasos y, al lado, el grafo del **tema entero** (cuántos mensajes pasaron por cada flecha). En Visual y Grafo, **Abrir todas** abre todas las rondas. |
| **Config** (`/config`) | Límites de la sala, de cada agente y de los invitados; activar y desactivar invitados. Solo el dueño, con la contraseña. |

![Sala](docs/sala-1280.png)
![Grafo](docs/grafo-1280.png)

## Ejecutar

```bash
git clone https://github.com/inematds/sala-multiplayer && cd sala-multiplayer
npm run demo          # demostración con agentes falsos (empieza limpia, carpeta propia): http://127.0.0.1:4601
npm test              # 46 pruebas, sin llamar a agentes ni a Telegram
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
5. Quien no sabe su id manda `ping` al bot: recibe el id de vuelta, y el dueño recibe un aviso con el comando listo (`/entrar <id> <persona>`) para meterla en la sala sin tocar el `.env`.
6. **Invitado sin id:** la persona envía `/entrar` al bot (en conversación privada). El dueño recibe "Pedido 7: Ana (@ana) quiere entrar. /aceitar 7 o /recusar 7", y el mismo pedido aparece en las aprobaciones pendientes del panel (aceptar pide la contraseña del dueño). El id queda guardado solo por dentro. El invitado conversa y llama a los agentes, pero no aprueba nada ni cambia la configuración, y tiene su propio tope de respuestas por día (30). Para desactivarlo: `/remover ana` en Telegram o el botón en la pantalla Config; el propio invitado sale con `/sair`. Para volver, envía `/entrar` de nuevo y el dueño aprueba otra vez.
7. Ejecuta `npm run pessoa` o `npm run atendimento`. El sello de Telegram en la parte superior del panel queda "ligado" (activo).

Es **un solo bot**: los agentes responden por él, con su nombre al frente ("Claude: ..."). Es necesario porque un bot de Telegram no ve los mensajes de otro bot.

## Cómo funciona

- **Llamar a un agente:** escribe `@claude` o `@codex`. Entre agentes solo vale el `@id` al comienzo de la frase ("@codex, ¿revisas esto?"); nombrar a un agente en medio del texto ("falta aprobar a @critico") no llama a nadie. Una respuesta que solo confirma ("de acuerdo, espero al dueño") no llama a nadie y aparece con el sello "solo confirma". Un agente solo vuelve a llamar a quien le habló si hace una pregunta. Sin mención, vale la ruta del perfil: en el modo pessoa va a Claude; en atendimento, el mensaje de un cliente va a Claude y la conversación del equipo queda solo entre personas.
- **Llamar a todos:** `@todos` llama a cada agente de la sala (menos el organizador de temas) para que dé su opinión. Solo dueño y equipo; un invitado sigue la ruta normal. Cada agente gasta una respuesta y cuenta en el tope por mensaje.
- **Grupos:** pide en el chat "crea el grupo @juegos con el crítico y codex". El agente propone y solo el dueño aprueba (misma pantalla de aprobaciones). Después, `@juegos` llama a sus miembros. Cambiar y borrar también se hace pidiendo en el chat. Se guardan en `data/<perfil>/grupos.json`. Solo dueño y equipo.
- **Íconos:** cada persona y cada agente tiene un ícono distinto. El lápiz ✎ junto al nombre lo cambia: cada uno cambia el suyo y el dueño cambia el de todos (agentes también). Se guarda en `data/<perfil>/icones.json`.
- **Herramientas:** el agente la pide con una línea `FERRAMENTA: nome | entrada`; la sala la ejecuta y devuelve el resultado. Ejemplos: `base` (base de respuestas en `perfis/base-atendimento.md`), `chamado`, `notas`, `hora`.
- **Aprobación:** en atendimento, la respuesta para el cliente queda como borrador. Solo sale cuando alguien del equipo la aprueba en el panel (puede editarla antes) o envía `/aprovar N` por Telegram.
- **Topes:** hasta 10 turnos seguidos entre agentes (6 en atendimento), hasta 12 respuestas de agentes por mensaje sumando todas las ramas (8 en atendimento), un límite de respuestas por día (400 y 300), un tope por invitado y, si quieres, un tope por agente. Evitan bucles que gasten la suscripción. El aviso de tope sale una vez por mensaje. Cámbialos en la pantalla Config.
- **Ronda:** cada mensaje de una persona abre una ronda; todo lo que provoca guarda su id (`rodada`) y el evento que lo disparó (`pai`).
- **Modelo, esfuerzo y largo de la respuesta:** cada agente tiene `nivel` (super, topo, executor, menor; el modelo de cada nivel sale de `~/.config/inema/modelos.env`), `esforco` (vacío = el del nivel, o low, medium, high, xhigh) y `linhas_max`. Defínelos en el perfil o, para un agente nuevo, en la misma tarjeta de aprobación.
- **Seguridad:** el panel solo abre en esta máquina (`127.0.0.1`). El mensaje de otra persona se trata como dato, nunca como orden. En el modo pessoa, el bot ignora a quien no es el dueño. Los agentes corren sin las herramientas propias del CLI, sin MCP y en una carpeta vacía.

## Agente nuevo a pedido

Pídelo en la conversación, por ejemplo: "crea un agente que revise mis textos". Claude no crea nada: devuelve una **propuesta** (nombre, rol, forma de trabajar, motor, herramientas y tope de respuestas por día). La sala revisa la propuesta y calcula el costo y el tiempo por respuesta, medidos en las respuestas anteriores. La propuesta aparece en las aprobaciones pendientes, y el agente solo entra después de que un aprobador del perfil la apruebe (en el panel o con `/aprovar N` en Telegram). Un mensaje de cliente nunca genera una propuesta.

Los agentes aprobados quedan en `data/<perfil>/agentes.json` (fuera de git). Para quitar uno, borra su entrada y reinicia la sala. En el panel, cada agente muestra cuántas respuestas dio hoy y su tiempo promedio por respuesta.

## Temas

Después de cada mensaje, la sala coloca la conversación en un tema. Sin el agente organizador, junta los mensajes seguidos de la misma conversación (hasta 15 minutos de intervalo) en un tema sin resumen escrito; las propuestas, aprobaciones y el costo aparecen igual, porque la sala ya los registra. Con el agente **@topicos** aprobado (pide "crea un agente que organice la conversación en temas"; el id tiene que ser `topicos`, o cambia `agente_topicos` en el perfil), él escribe título, resumen, decidido y pendiente, y elige entre actualizar un tema abierto o abrir otro. Cada resumen cuenta como una respuesta en el tope diario. Los temas quedan en la base de la sala (`data/<perfil>/sala.db`).

## Configuración: solo el dueño la cambia

Los límites (turnos entre agentes, respuestas por mensaje, respuestas por día, largo de la respuesta, reglas del invitado: tope diario, si necesita aprobación nueva al volver, si la invitación vence) y el modelo, el esfuerzo y el tope de cada agente están en la pantalla **Config** (`/config`). Cambiarlos exige la **contraseña del dueño** (`SALA_DONO_SENHA` en el `.env`). En Telegram, el dueño usa `/config` para verlos y `/config teto_turnos 20` (o `/config agente.claude.nivel super`) para cambiarlos, reconocido por su id. Quien no es el dueño lo pide en el chat ("sube el tope a 20"): el agente arma una propuesta y solo el dueño la aprueba. Los cambios valen al instante y quedan en `data/<perfil>/config.json`, por encima del perfil. El dueño de cada perfil es el campo `"dono"` del JSON.

## Perfiles

`perfis/pessoa.json` y `perfis/atendimento.json` definen quién participa, el rol y la personalidad de cada agente, las herramientas, la ruta por defecto, quién aprueba y los topes. Para crear un área nueva, copia un perfil y ejecuta `node server.mjs --perfil <nombre>`.

## Próximos pasos

Mira el [ROADMAP.md](ROADMAP.md) (en portugués): herramienta nueva a pedido (con dos aprobaciones) y los **consejos** de [7conselho](https://github.com/inematds/7conselho) como participantes de la sala.

---

[INEMA.CLUB](https://inema.club) · Licencia MIT
