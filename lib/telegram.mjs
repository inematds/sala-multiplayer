// Entrada pelo Telegram: um bot só, como porta da sala (um bot não enxerga mensagens de outro bot,
// então os agentes falam pelo mesmo bot, com o nome na frente). Long polling com fetch, sem dependências.
// Sem SALA_TELEGRAM_TOKEN no .env o módulo fica desligado e a sala funciona só pelo painel.

export function criarTelegram({ token, banco, perfil, aoReceber, aoComando, aoPing = () => {}, aoEntrada = async () => '', log = console.log }) {
  const base = `https://api.telegram.org/bot${token}`;
  let parar = false;
  let offset = 0;

  async function chamar(metodo, corpo) {
    const r = await fetch(`${base}/${metodo}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(40000),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`${metodo}: ${j.description}`);
    return j.result;
  }

  function quem(msg) {
    const u = msg.from;
    const conhecido = banco.porTelegram(u.id);
    if (conhecido) return conhecido;
    const tg = perfil.telegram || {};
    if (!tg.aceitar_desconhecidos) return null;
    return banco.participante({
      id: `tg-${u.id}`, nome: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `tg ${u.id}`,
      tipo: 'pessoa', papel: tg.papel_desconhecido || 'cliente', origem: 'telegram', telegram_id: u.id,
    });
  }

  async function laco() {
    while (!parar) {
      try {
        const ups = await chamar('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
        for (const up of ups) {
          offset = up.update_id + 1;
          const msg = up.message;
          if (!msg?.text || msg.from?.is_bot) continue;
          // Convidado: a pessoa pede com /entrar (sem id nenhum), o dono aceita com /aceitar N. Só em conversa privada.
          if (/^\/entrar(@\w+)?\s*$/i.test(msg.text)) {
            const resp = msg.chat.type !== 'private' ? 'Peça para entrar numa conversa privada com o bot.'
              : await aoEntrada({ tid: msg.from.id, nome: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' '), usuario: msg.from.username || '' }).catch((e) => `Não consegui pedir: ${e.message}`);
            if (resp) await chamar('sendMessage', { chat_id: msg.chat.id, text: resp }).catch(() => {});
            continue;
          }
          // Ping-pong: qualquer pessoa descobre o próprio id para o dono colocar no .env.
          if (/^\s*(\/id|\/ping|ping)(@\w+)?\s*$/i.test(msg.text) || (/^\/start/.test(msg.text) && !banco.porTelegram(msg.from.id))) {
            const dentro = banco.porTelegram(msg.from.id);
            await chamar('sendMessage', { chat_id: msg.chat.id, text: `pong · seu id no Telegram: ${msg.from.id}${dentro ? ` · você está na sala como ${dentro.nome}` : ' · para participar, mande /entrar e o dono da sala recebe o pedido'}` }).catch(() => {});
            log(`[telegram] ping de ${msg.from.first_name || ''} @${msg.from.username || ''}: id ${msg.from.id}`);
            if (!dentro) await aoPing(msg.from);
            continue;
          }
          const p = quem(msg);
          if (!p) {
            log(`[telegram] ignorado: remetente fora da sala (id ${msg.from.id}, ${msg.from.first_name || ''} @${msg.from.username || ''})`);
            if (msg.chat.type === 'private') await chamar('sendMessage', { chat_id: msg.chat.id, text: 'Você não está na sala. Para pedir ao dono, mande /entrar.' }).catch(() => {});
            continue;
          }
          const conversa = `tg:${msg.chat.id}`;
          const cmd = msg.text.match(/^\/(aprovar|aceitar|recusar)(?:@\w+)?\s+(\d+)/i);
          if (cmd) { await aoComando({ quem: p, acao: cmd[1].toLowerCase() === 'recusar' ? 'recusar' : 'aprovar', id: Number(cmd[2]), conversa }); continue; }
          if (/^\/sair(@\w+)?\s*$/i.test(msg.text)) { await aoComando({ quem: p, acao: 'sair', conversa }); continue; }
          const rem = msg.text.match(/^\/remover(?:@\w+)?\s+(\S+)/i);
          if (rem) { await aoComando({ quem: p, acao: 'remover', alvo: rem[1], conversa }); continue; }
          const ent = msg.text.match(/^\/entrar(?:@\w+)?\s+(\d+)\s+([a-z0-9_-]+)\s*$/i);
          if (ent) { await aoComando({ quem: p, acao: 'entrar', tid: ent[1], pessoa: ent[2].toLowerCase(), conversa }); continue; }
          const cfg = msg.text.match(/^\/config(?:@\w+)?(?:\s+(.+))?$/is);
          if (cfg) { await aoComando({ quem: p, acao: 'config', args: cfg[1]?.trim() || '', conversa }); continue; }
          if (/^\/start/.test(msg.text)) continue;
          aoReceber({ de: p.id, conversa, texto: msg.text, via: 'telegram' }).catch((e) => log(`[telegram] erro: ${e.message}`));
        }
      } catch (e) {
        log(`[telegram] ${e.message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  return {
    iniciar() { laco(); log('[telegram] ligado (long polling)'); },
    parar() { parar = true; },
    async enviar(conversa, texto) {
      const chat = conversa.replace(/^tg:/, '');
      for (let i = 0; i < texto.length; i += 4000) await chamar('sendMessage', { chat_id: chat, text: texto.slice(i, i + 4000) });
    },
    async avisar(telegramId, texto) {
      await chamar('sendMessage', { chat_id: telegramId, text: texto });
    },
  };
}
