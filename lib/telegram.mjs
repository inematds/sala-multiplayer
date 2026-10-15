// Entrada pelo Telegram: um bot só, como porta da sala (um bot não enxerga mensagens de outro bot,
// então os agentes falam pelo mesmo bot, com o nome na frente). Long polling com fetch, sem dependências.
// Sem SALA_TELEGRAM_TOKEN no .env o módulo fica desligado e a sala funciona só pelo painel.

export function criarTelegram({ token, banco, perfil, aoReceber, aoComando, log = console.log }) {
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
          const p = quem(msg);
          if (!p) { log(`[telegram] ignorado: remetente fora da sala (${msg.from.id})`); continue; }
          const conversa = `tg:${msg.chat.id}`;
          const cmd = msg.text.match(/^\/(aprovar|recusar)\s+(\d+)/i);
          if (cmd) { await aoComando({ quem: p, acao: cmd[1].toLowerCase(), id: Number(cmd[2]), conversa }); continue; }
          if (/^\/start/.test(msg.text)) continue;
          aoReceber({ de: p.id, conversa, texto: msg.text }).catch((e) => log(`[telegram] erro: ${e.message}`));
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
